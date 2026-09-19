import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { runConfigCommand } from '../src/commands/config.js';
import { runHistoryCommand } from '../src/commands/history.js';
import { createReceipt, writeReceipt } from '../src/core/history.js';

test('config init and show expose effective safe defaults', async (t) => {
  const root = await mkdtemp(join(os.tmpdir(), 'cw-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  const workspace = join(root, 'workspace');
  await mkdir(home);
  await mkdir(workspace);
  await writeFile(join(workspace, '.devcleanignore'), 'coverage\n');
  const initOutput = capture();
  assert.equal(await runConfigCommand(['init', '--json'], {
    homeDir: home, cwd: workspace, stdout: initOutput, stderr: capture(),
  }), 0);
  const configPath = JSON.parse(initOutput.value).path;
  assert.equal(JSON.parse(await readFile(configPath, 'utf8')).defaultPreset, 'safe');

  const showOutput = capture();
  assert.equal(await runConfigCommand(['show', '--json'], {
    homeDir: home, cwd: workspace, stdout: showOutput, stderr: capture(),
  }), 0);
  const shown = JSON.parse(showOutput.value);
  assert.equal(shown.sensitivePolicy, 'confirm');
  assert.deepEqual(shown.effectiveIgnorePatterns, ['coverage']);
});

test('history command returns stored cleanup receipts', async (t) => {
  const home = await mkdtemp(join(os.tmpdir(), 'cw-history-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const receipt = createReceipt({
    version: 'test', args: ['--apply'], preset: 'safe',
    plan: { targetIds: ['dist'], entries: [{ path: '/tmp/dist', size: 10 }] },
    report: {
      freed: 10, deleted: 1, failed: 0, skipped: 0, aborted: false,
      results: [{
        entry: { path: '/tmp/dist', targetId: 'dist', size: 10 },
        status: 'deleted', freed: 10,
      }],
    },
  });
  await writeReceipt(receipt, { homeDir: home });
  const stdout = capture();
  assert.equal(await runHistoryCommand(['--json'], { homeDir: home, stdout, stderr: capture() }), 0);
  const document = JSON.parse(stdout.value);
  assert.equal(document.receipts.length, 1);
  assert.equal(document.receipts[0].recoveredBytes, 10);
});

function capture() {
  return { value: '', write(chunk) { this.value += chunk; } };
}
