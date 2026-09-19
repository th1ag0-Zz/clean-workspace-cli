import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { scanGlobalCaches } from '../src/core/scanner.js';
import { getGlobalTargets } from '../src/core/targets.js';

test('Metro scan discovers metro and haste caches instead of treating a glob as a path', async (t) => {
  const root = await mkdtemp(join(os.tmpdir(), 'cw-metro-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  const temp = join(root, 'tmp');
  await mkdir(home);
  await mkdir(join(temp, 'metro-cache'), { recursive: true });
  await mkdir(join(temp, 'haste-map'), { recursive: true });
  await writeFile(join(temp, 'metro-cache', 'data'), 'metro');
  await writeFile(join(temp, 'haste-map', 'data'), 'haste');
  await mkdir(join(temp, 'unrelated'));

  const metroTarget = getGlobalTargets(home, temp).find((target) => target.id === 'metro_cache');
  const [result] = await scanGlobalCaches({ homeDir: home, tempDir: temp, targets: [metroTarget] });

  assert.deepEqual(result.items.map((item) => item.name).sort(), ['haste-map', 'metro-cache']);
  assert.equal(result.items.reduce((total, item) => total + item.size, 0), 10);
});
