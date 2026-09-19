import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const cliPath = resolve('src/index.js');

test('CLI end-to-end scans, dry-runs, applies, and reads history', async (t) => {
  const root = await mkdtemp(join(os.tmpdir(), 'cw-e2e-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  const workspace = join(root, "workspace 'ação'");
  const dist = join(workspace, 'dist');
  await mkdir(home);
  await mkdir(dist, { recursive: true });
  await writeFile(join(dist, 'bundle.js'), 'bundle');
  const env = { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' };

  const scan = await cli(['scan', workspace, '--json'], env);
  assert.equal(scan.summary.itemCount, 1);
  assert.equal(scan.targets.find((target) => target.id === 'dist').itemCount, 1);

  const dryRun = await cli(['clean', workspace, '--preset', 'safe', '--dry-run', '--json'], env);
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.summary.itemCount, 1);
  await access(join(dist, 'bundle.js'));

  const applied = await cli([
    'clean', workspace, '--preset', 'safe', '--apply', '--yes', '--json',
  ], env);
  assert.equal(applied.summary.deleted, 1);
  await assert.rejects(access(dist), { code: 'ENOENT' });

  const history = await cli(['history', '--json'], env);
  assert.equal(history.receipts.length, 1);
  assert.equal(history.receipts[0].results[0].status, 'deleted');
  assert.equal(history.receipts[0].cliVersion, '2.0.0-beta.0');
});

test('CLI end-to-end returns exit code 2 for an invalid workspace', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'scan', '/definitely/missing/devclean-path', '--json']),
    (error) => error.code === 2 && JSON.parse(error.stderr).error.code === 'INVALID_USAGE'
  );
});

async function cli(args, env) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...args], { env });
  assert.equal(stderr, '');
  return JSON.parse(stdout);
}
