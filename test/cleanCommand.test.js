import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { parseCleanArgs, runCleanCommand } from '../src/commands/clean.js';
import { readHistory } from '../src/core/history.js';

test('safe apply deletes only safe targets and writes a complete receipt', async (t) => {
  const { root, home, workspace } = await fixture(t, 'cw-clean-safe-');
  const dist = join(workspace, 'dist');
  const modules = join(workspace, 'node_modules');
  await mkdir(dist);
  await mkdir(modules);
  await writeFile(join(dist, 'app.js'), 'safe');
  await writeFile(join(modules, 'package.js'), 'review');
  const stdout = capture();
  const stderr = capture();

  const exitCode = await runCleanCommand([
    workspace, '--preset', 'safe', '--apply', '--yes', '--json',
  ], { version: '2.0.0-test', homeDir: home, stdout, stderr });
  const result = JSON.parse(stdout.value);

  assert.equal(exitCode, 0);
  assert.equal(stderr.value, '');
  assert.equal(result.applied, true);
  assert.equal(result.summary.deleted, 1);
  await assert.rejects(access(dist), { code: 'ENOENT' });
  await access(modules);

  const [receipt] = await readHistory({ homeDir: home });
  assert.equal(receipt.cliVersion, '2.0.0-test');
  assert.equal(receipt.preset, 'safe');
  assert.equal(receipt.estimatedBytes, 4);
  assert.equal(receipt.recoveredBytes, 4);
  assert.equal(receipt.results[0].status, 'deleted');
  assert.deepEqual(receipt.errors, []);
  assert.ok(root);
});

test('dry-run honors .devcleanignore and never writes history or deletes', async (t) => {
  const { home, workspace } = await fixture(t, 'cw-clean-ignore-');
  const dist = join(workspace, 'dist');
  await mkdir(dist);
  await writeFile(join(dist, 'app.js'), 'keep');
  await writeFile(join(workspace, '.devcleanignore'), 'dist\n');
  const stdout = capture();

  const exitCode = await runCleanCommand([
    workspace, '--preset', 'safe', '--dry-run', '--json',
  ], { version: 'test', homeDir: home, stdout, stderr: capture() });

  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(stdout.value).summary.itemCount, 0);
  await access(join(dist, 'app.js'));
  assert.deepEqual(await readHistory({ homeDir: home }), []);
});

test('deep preset includes review targets but excludes sensitive targets', async (t) => {
  const { home, workspace } = await fixture(t, 'cw-clean-deep-');
  const modules = join(workspace, 'node_modules');
  await mkdir(modules);
  await writeFile(join(modules, 'package.js'), 'review');
  const workspaceOutput = capture();

  await runCleanCommand([
    workspace, '--preset', 'deep', '--dry-run', '--json',
  ], { version: 'test', homeDir: home, stdout: workspaceOutput, stderr: capture() });
  assert.equal(JSON.parse(workspaceOutput.value).summary.itemCount, 1);

  await mkdir(join(home, '.Trash'), { recursive: true });
  await writeFile(join(home, '.Trash', 'private.txt'), 'sensitive');
  const systemOutput = capture();
  await runCleanCommand([
    '--system', '--preset', 'deep', '--dry-run', '--json',
  ], { version: 'test', homeDir: home, stdout: systemOutput, stderr: capture() });
  assert.equal(JSON.parse(systemOutput.value).summary.itemCount, 0);
  await access(join(home, '.Trash', 'private.txt'));
});

test('sensitive cleanup requires an explicit target and can be automated explicitly', async (t) => {
  const { home } = await fixture(t, 'cw-clean-sensitive-');
  const privateFile = join(home, '.Trash', 'private.txt');
  await mkdir(join(home, '.Trash'), { recursive: true });
  await writeFile(privateFile, 'sensitive');
  const rejected = capture();

  const rejectedCode = await runCleanCommand([
    '--system', '--preset', 'safe', '--target', 'trash', '--dry-run', '--json',
  ], { version: 'test', homeDir: home, stdout: capture(), stderr: rejected });
  assert.equal(rejectedCode, 2);

  const stdout = capture();
  const exitCode = await runCleanCommand([
    '--system', '--target', 'trash', '--apply', '--yes', '--json',
  ], { version: 'test', homeDir: home, stdout, stderr: capture() });
  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(stdout.value).summary.deleted, 1);
  await assert.rejects(access(privateFile), { code: 'ENOENT' });
});

test('partial failures continue independent items and are recorded', async (t) => {
  const { home, workspace } = await fixture(t, 'cw-clean-partial-');
  const dist = join(workspace, 'dist');
  const coverage = join(workspace, 'coverage');
  await mkdir(dist);
  await mkdir(coverage);
  await writeFile(join(dist, 'app.js'), 'delete');
  await writeFile(join(coverage, 'coverage.json'), 'gone early');
  const stdout = capture();

  const exitCode = await runCleanCommand([
    workspace, '--preset', 'safe', '--apply',
  ], {
    version: 'test', homeDir: home, stdin: { isTTY: true }, stdout, stderr: capture(),
    confirmApply: async () => {
      await rm(coverage, { recursive: true });
      return true;
    },
  });

  assert.equal(exitCode, 1);
  await assert.rejects(access(dist), { code: 'ENOENT' });
  const [receipt] = await readHistory({ homeDir: home });
  assert.equal(receipt.deleted, 1);
  assert.equal(receipt.failed, 1);
  assert.equal(receipt.errors[0].code, 'MISSING_PATH');
});

test('clean without automation flags uses interactive selection and confirmation', async (t) => {
  const { home, workspace } = await fixture(t, 'cw-clean-interactive-');
  const dist = join(workspace, 'dist');
  await mkdir(dist);
  await writeFile(join(dist, 'app.js'), 'delete');
  let confirmed = false;

  const exitCode = await runCleanCommand([workspace], {
    version: 'test', homeDir: home, stdin: { isTTY: true },
    stdout: capture(), stderr: capture(),
    selectTargets: async () => ['dist'],
    confirmApply: async () => {
      confirmed = true;
      return true;
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(confirmed, true);
  await assert.rejects(access(dist), { code: 'ENOENT' });
  assert.equal((await readHistory({ homeDir: home })).length, 1);
});

test('interactive cancellation preserves the plan and writes no receipt', async (t) => {
  const { home, workspace } = await fixture(t, 'cw-clean-cancel-');
  const dist = join(workspace, 'dist');
  await mkdir(dist);
  await writeFile(join(dist, 'app.js'), 'keep');

  const exitCode = await runCleanCommand([workspace], {
    version: 'test', homeDir: home, stdin: { isTTY: true },
    stdout: capture(), stderr: capture(),
    selectTargets: async () => ['dist'],
    confirmApply: async () => false,
  });

  assert.equal(exitCode, 0);
  await access(join(dist, 'app.js'));
  assert.deepEqual(await readHistory({ homeDir: home }), []);
});

test('clean parser enforces explicit apply semantics', () => {
  assert.deepEqual(parseCleanArgs(['--target=dist,node_modules', '--dry-run']), {
    mode: 'workspace', path: null, preset: null, targets: ['dist', 'node_modules'],
    dryRun: true, apply: false, yes: false, json: false, help: false,
  });
  assert.throws(() => parseCleanArgs(['--apply', '--dry-run']), /cannot be used together/);
  assert.throws(() => parseCleanArgs(['--yes']), /requires --apply/);
  assert.throws(() => parseCleanArgs(['--json', '--apply']), /requires --yes/);
});

async function fixture(t, prefix) {
  const root = await mkdtemp(join(os.tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  const workspace = join(root, 'workspace');
  await mkdir(home);
  await mkdir(workspace);
  return { root, home, workspace };
}

function capture() {
  return { value: '', write(chunk) { this.value += chunk; } };
}
