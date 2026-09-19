import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'fs/promises';
import { join } from 'path';
import os from 'os';
import { scanSystemTargets } from '../src/cleaners/systemScanner.js';

const DAY = 24 * 60 * 60 * 1000;

test('system scan includes Trash and only items wholly older than 30 days', async (t) => {
  const homeDir = await mkdtemp(join(os.tmpdir(), 'cw-system-scan-'));
  t.after(() => rm(homeDir, { recursive: true, force: true }));

  const now = new Date('2026-09-19T12:00:00Z').getTime();
  const oldTime = new Date(now - 30 * DAY);
  const recentTime = new Date(now - 2 * DAY);

  await mkdir(join(homeDir, '.Trash'), { recursive: true });
  await mkdir(join(homeDir, 'Downloads', 'old-folder'), { recursive: true });
  await mkdir(join(homeDir, 'Downloads', 'mixed-folder'), { recursive: true });
  await mkdir(join(homeDir, 'Library', 'Logs'), { recursive: true });

  const trashFile = join(homeDir, '.Trash', 'recent-trash.txt');
  const oldDownload = join(homeDir, 'Downloads', 'old.zip');
  const recentDownload = join(homeDir, 'Downloads', 'recent.zip');
  const oldNestedFile = join(homeDir, 'Downloads', 'old-folder', 'archive.txt');
  const recentNestedFile = join(homeDir, 'Downloads', 'mixed-folder', 'keep.txt');
  const oldLog = join(homeDir, 'Library', 'Logs', 'old.log');

  await Promise.all([
    writeFile(trashFile, 'trash'),
    writeFile(oldDownload, 'old download'),
    writeFile(recentDownload, 'recent download'),
    writeFile(oldNestedFile, 'old nested file'),
    writeFile(recentNestedFile, 'recent nested file'),
    writeFile(oldLog, 'old log'),
  ]);

  await Promise.all([
    utimes(oldDownload, oldTime, oldTime),
    utimes(oldNestedFile, oldTime, oldTime),
    utimes(join(homeDir, 'Downloads', 'old-folder'), oldTime, oldTime),
    utimes(oldLog, oldTime, oldTime),
    utimes(recentDownload, recentTime, recentTime),
    utimes(recentNestedFile, recentTime, recentTime),
  ]);

  const results = await scanSystemTargets({ homeDir, now });
  const byId = Object.fromEntries(results.map((target) => [target.id, target]));

  assert.deepEqual(byId.trash.items.map((item) => item.name), ['recent-trash.txt']);
  assert.deepEqual(
    byId.downloads.items.map((item) => item.name).sort(),
    ['old-folder', 'old.zip']
  );
  assert.deepEqual(byId.logs.items.map((item) => item.name), ['old.log']);
  assert.equal(byId.downloads.items.find((item) => item.name === 'old-folder').size, 15);
});

test('system scan returns empty groups when user locations do not exist', async (t) => {
  const homeDir = await mkdtemp(join(os.tmpdir(), 'cw-system-empty-'));
  t.after(() => rm(homeDir, { recursive: true, force: true }));

  const results = await scanSystemTargets({ homeDir });

  assert.equal(results.length, 3);
  assert.ok(results.every((target) => target.items.length === 0));
});
