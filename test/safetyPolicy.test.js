import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { executeCleanupPlan } from '../src/core/executor.js';
import { CleanupPlan, ScanResult } from '../src/core/models.js';
import { SafetyPolicy } from '../src/core/safetyPolicy.js';
import { inspectItem, scanWorkspace } from '../src/core/scanner.js';
import { LOCAL_TARGETS } from '../src/core/targets.js';

test('executor safely deletes paths containing shell-special characters', async (t) => {
  const workspace = await mkdtemp(join(os.tmpdir(), 'cw-special-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const artifact = join(workspace, "projeto 'ação'; $(touch should-not-run)", 'dist');
  const sentinel = join(workspace, 'should-not-run');
  await mkdir(artifact, { recursive: true });
  await writeFile(join(artifact, 'bundle.js'), 'content');

  const distTarget = LOCAL_TARGETS.find((target) => target.id === 'dist');
  const results = await scanWorkspace({ workspaceRoot: workspace, targets: [distTarget] });
  const report = await executeCleanupPlan(CleanupPlan.from(results), {
    policy: new SafetyPolicy({ homeDir: dirname(workspace), workspaceRoot: workspace }),
  });

  assert.equal(report.deleted, 1);
  assert.equal(report.failed, 0);
  await assert.rejects(lstat(artifact), { code: 'ENOENT' });
  await assert.rejects(lstat(sentinel), { code: 'ENOENT' });
});

test('policy refuses lexical traversal outside the scan scope', async (t) => {
  const root = await mkdtemp(join(os.tmpdir(), 'cw-traversal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  const outside = join(root, 'outside.txt');
  await mkdir(workspace);
  await writeFile(outside, 'keep');

  const entry = await makeItem(join(workspace, '..', 'outside.txt'));
  const plan = planFor(workspace, entry);
  const report = await executeCleanupPlan(plan, {
    policy: new SafetyPolicy({ homeDir: root, workspaceRoot: workspace }),
  });

  assert.equal(report.failed, 1);
  assert.equal(report.results[0].error.code, 'OUTSIDE_SCOPE');
  assert.equal(await readFile(outside, 'utf8'), 'keep');
});

test('policy refuses direct and intermediate symlinks', async (t) => {
  const root = await mkdtemp(join(os.tmpdir(), 'cw-symlink-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  const outside = join(root, 'outside');
  await mkdir(workspace);
  await mkdir(outside);
  await writeFile(join(outside, 'secret.txt'), 'keep');

  const directLink = join(workspace, 'direct-link');
  const directoryLink = join(workspace, 'directory-link');
  await symlink(join(outside, 'secret.txt'), directLink);
  await symlink(outside, directoryLink);

  const directReport = await executeCleanupPlan(planFor(workspace, await makeItem(directLink)), {
    policy: new SafetyPolicy({ homeDir: root, workspaceRoot: workspace }),
  });
  const traversedReport = await executeCleanupPlan(
    planFor(workspace, await makeItem(join(directoryLink, 'secret.txt'))),
    { policy: new SafetyPolicy({ homeDir: root, workspaceRoot: workspace }) }
  );

  assert.equal(directReport.results[0].error.code, 'SYMLINK');
  assert.equal(traversedReport.results[0].error.code, 'SYMLINK');
  assert.equal(await readFile(join(outside, 'secret.txt'), 'utf8'), 'keep');
});

test('policy refuses filesystem root, home, and workspace root', async (t) => {
  const home = await mkdtemp(join(os.tmpdir(), 'cw-protected-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const workspace = join(home, 'workspace');
  await mkdir(workspace);
  const policy = new SafetyPolicy({ homeDir: home, workspaceRoot: workspace });

  for (const protectedPath of [resolve('/'), home, workspace]) {
    const entry = await makeItem(protectedPath, false);
    await assert.rejects(
      policy.validate({ ...entry, allowedRoots: [dirname(protectedPath)] }),
      (error) => error.code === 'PROTECTED_PATH'
    );
  }
});

test('policy detects an item changed after its scan', async (t) => {
  const root = await mkdtemp(join(os.tmpdir(), 'cw-changed-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  const artifact = join(workspace, 'dist');
  await mkdir(artifact, { recursive: true });
  const scanned = await inspectItem(artifact);
  await writeFile(join(artifact, 'new-file'), 'changed');

  const report = await executeCleanupPlan(planFor(workspace, scanned), {
    policy: new SafetyPolicy({ homeDir: root, workspaceRoot: workspace }),
  });
  assert.equal(report.results[0].error.code, 'ITEM_CHANGED');
  assert.ok(await lstat(artifact));
});

test('executor stops starting new items after cancellation', async (t) => {
  const root = await mkdtemp(join(os.tmpdir(), 'cw-abort-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  const artifact = join(workspace, 'dist');
  await mkdir(artifact, { recursive: true });
  const controller = new AbortController();
  controller.abort();

  const report = await executeCleanupPlan(planFor(workspace, await inspectItem(artifact)), {
    policy: new SafetyPolicy({ homeDir: root, workspaceRoot: workspace }),
    signal: controller.signal,
  });

  assert.equal(report.aborted, true);
  assert.equal(report.skipped, 1);
  assert.equal(report.results[0].status, 'skipped');
  assert.ok(await lstat(artifact));
});

test('executor reports permission failures without treating them as success', {
  skip: process.platform === 'win32' || process.getuid?.() === 0,
}, async (t) => {
  const root = await mkdtemp(join(os.tmpdir(), 'cw-permission-'));
  t.after(async () => {
    await chmod(join(root, 'workspace'), 0o700).catch(() => {});
    await rm(root, { recursive: true, force: true });
  });
  const workspace = join(root, 'workspace');
  const artifact = join(workspace, 'dist');
  await mkdir(artifact, { recursive: true });
  await writeFile(join(artifact, 'app.js'), 'keep');
  const plan = planFor(workspace, await inspectItem(artifact));
  await chmod(workspace, 0o500);

  const report = await executeCleanupPlan(plan, {
    policy: new SafetyPolicy({ homeDir: root, workspaceRoot: workspace }),
  });

  assert.equal(report.deleted, 0);
  assert.equal(report.failed, 1);
  assert.match(report.results[0].error.code, /EACCES|EPERM/);
});

function planFor(scopeRoot, item) {
  return CleanupPlan.from([new ScanResult({
    target: { id: 'test', label: 'Test target' },
    scopeRoot,
    items: [item],
  })]);
}

async function makeItem(itemPath, includeRealPath = true) {
  const stats = await lstat(itemPath);
  const type = stats.isSymbolicLink() ? 'symlink' : stats.isDirectory() ? 'directory' : 'file';
  return {
    path: resolve(itemPath),
    ...(includeRealPath ? { realPath: resolve(itemPath) } : {}),
    name: 'test',
    size: stats.size,
    type,
    fingerprint: {
      device: stats.dev,
      inode: stats.ino,
      mode: stats.mode,
      size: stats.size,
      modifiedAt: stats.mtimeMs,
      type,
    },
  };
}
