import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { createConcurrencyLimiter, smartScan } from '../src/core/scanner.js';
import { summarizeScan } from '../src/reporters/scanSummary.js';

test('smart scan combines workspace, global cache, and system results', async (t) => {
  const root = await mkdtemp(join(os.tmpdir(), 'cw-smart-scan-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  const home = join(root, 'home');
  const temp = join(root, 'tmp');
  const cache = join(home, '.cache-tool');
  const trash = join(home, '.Trash');
  await Promise.all([
    mkdir(join(workspace, 'dist'), { recursive: true }),
    mkdir(cache, { recursive: true }),
    mkdir(trash, { recursive: true }),
    mkdir(temp, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(workspace, 'dist', 'app.js'), 'safe'),
    writeFile(join(cache, 'cache.bin'), 'review'),
    writeFile(join(trash, 'old.txt'), 'sensitive'),
  ]);

  const localTargets = [target('build', 'workspace', 'safe', { patterns: ['**/dist'] })];
  const globalTargets = [target('tool_cache', 'global-cache', 'review', { pathSpec: { path: cache } })];
  const systemTargets = [target('trash', 'system', 'sensitive', { path: trash, minAgeDays: 0 })];
  const results = await smartScan({
    mode: 'all', workspaceRoot: workspace, homeDir: home, tempDir: temp,
    localTargets, globalTargets, systemTargets, concurrency: 2,
  });

  assert.deepEqual(results.map((result) => result.targetId), ['build', 'tool_cache', 'trash']);
  assert.deepEqual(summarizeScan(results), {
    scannedTargetCount: 3,
    targetCount: 3,
    itemCount: 3,
    reclaimableBytes: 19,
    byRisk: { safe: 1, review: 1, sensitive: 1 },
    recommendation: {
      code: 'review-sensitive-items',
      message: 'Review sensitive items individually before cleaning.',
    },
  });

  const safeOnly = await smartScan({
    mode: 'all', workspaceRoot: workspace, homeDir: home, tempDir: temp,
    localTargets, globalTargets, systemTargets, risks: ['safe'], concurrency: 2,
  });
  assert.deepEqual(safeOnly.map((result) => result.targetId), ['build']);
});

test('filesystem concurrency limiter never exceeds its configured bound', async () => {
  const limit = createConcurrencyLimiter(2);
  let active = 0;
  let maximum = 0;
  await Promise.all(Array.from({ length: 8 }, (_, index) => limit(async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return index;
  })));
  assert.equal(maximum, 2);
});

test('smart scan does not double-count paths matched by overlapping targets', async (t) => {
  const workspace = await mkdtemp(join(os.tmpdir(), 'cw-overlap-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await mkdir(join(workspace, 'android', 'build'), { recursive: true });
  await writeFile(join(workspace, 'android', 'build', 'app.bin'), '1234');

  const results = await smartScan({
    workspaceRoot: workspace,
    localTargets: [
      target('generic_build', 'workspace', 'safe', { patterns: ['**/build'] }),
      target('android_build', 'workspace', 'safe', { patterns: ['**/android/build'] }),
    ],
  });

  assert.equal(summarizeScan(results).itemCount, 1);
  assert.equal(summarizeScan(results).reclaimableBytes, 4);
  assert.equal(results.find((result) => result.targetId === 'android_build').items.length, 1);
});

function target(id, category, risk, extra) {
  return { id, category, risk, label: id, description: id, icon: '•', ...extra };
}
