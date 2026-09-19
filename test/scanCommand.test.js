import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { parseScanArgs, runScanCommand, ScanUsageError } from '../src/commands/scan.js';

test('scan command emits stable JSON and never changes scanned files', async (t) => {
  const workspace = await mkdtemp(join(os.tmpdir(), 'cw-scan-command-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const artifact = join(workspace, 'dist');
  await mkdir(artifact);
  await writeFile(join(artifact, 'bundle.js'), 'content');
  const stdout = capture();
  const stderr = capture();

  const exitCode = await runScanCommand([workspace, '--json'], {
    version: '2.0.0-test', stdout, stderr,
  });
  const document = JSON.parse(stdout.value);

  assert.equal(exitCode, 0);
  assert.equal(stderr.value, '');
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.command, 'scan');
  assert.equal(document.cliVersion, '2.0.0-test');
  assert.equal(document.scope.mode, 'workspace');
  assert.equal(document.summary.itemCount, 1);
  assert.equal(document.summary.reclaimableBytes, 7);
  assert.equal(document.targets.find((target) => target.id === 'dist').items[0].relativePath, './dist');
  await access(join(artifact, 'bundle.js'));
});

test('scan argument parser supports modes and comma-separated filters', () => {
  assert.deepEqual(parseScanArgs([
    '--all', '--category=workspace,global-cache', '--risk', 'safe,review', '--json', './project',
  ]), {
    mode: 'all',
    path: './project',
    json: true,
    help: false,
    categories: ['workspace', 'global-cache'],
    risks: ['safe', 'review'],
  });
  assert.throws(() => parseScanArgs(['--all', '--system']), ScanUsageError);
  assert.throws(() => parseScanArgs(['--risk', 'unknown']), /Unknown risk/);
});

test('scan command reports invalid paths with documented exit code 2', async () => {
  const stdout = capture();
  const stderr = capture();
  const exitCode = await runScanCommand(['/path/that/does/not/exist', '--json'], {
    version: 'test', stdout, stderr,
  });

  assert.equal(exitCode, 2);
  assert.equal(stdout.value, '');
  assert.equal(JSON.parse(stderr.value).error.code, 'INVALID_USAGE');
});

function capture() {
  return {
    value: '',
    write(chunk) { this.value += chunk; },
  };
}
