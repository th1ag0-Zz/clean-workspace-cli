import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { smartScan } from '../src/core/scanner.js';
import { summarizeScan } from '../src/reporters/scanSummary.js';

const options = parseArgs(process.argv.slice(2));
const workspaceRoot = await mkdtemp(join(os.tmpdir(), 'devclean-benchmark-'));

try {
  await createFixture(workspaceRoot, options);
  await smartScan({ mode: 'workspace', workspaceRoot, concurrency: options.concurrency });

  const durations = [];
  let summary;
  for (let run = 0; run < options.runs; run++) {
    const started = performance.now();
    const results = await smartScan({
      mode: 'workspace', workspaceRoot, concurrency: options.concurrency,
    });
    durations.push(performance.now() - started);
    summary = summarizeScan(results);
  }

  const sorted = [...durations].sort((a, b) => a - b);
  process.stdout.write(`${JSON.stringify({
    benchmark: 'workspace-scan',
    fixture: {
      projects: options.projects,
      filesPerArtifact: options.files,
      bytesPerFile: options.bytes,
      expectedItems: options.projects * 2,
    },
    concurrency: options.concurrency,
    runs: options.runs,
    durationsMs: durations.map(round),
    medianMs: round(sorted[Math.floor(sorted.length / 2)]),
    summary,
  }, null, 2)}\n`);
} finally {
  await rm(workspaceRoot, { recursive: true, force: true });
}

async function createFixture(root, { projects, files, bytes }) {
  const content = 'x'.repeat(bytes);
  for (let project = 0; project < projects; project++) {
    for (const artifact of ['dist', 'node_modules']) {
      const directory = join(root, `project-${String(project).padStart(4, '0')}`, artifact);
      await mkdir(directory, { recursive: true });
      await Promise.all(Array.from({ length: files }, (_, file) =>
        writeFile(join(directory, `file-${String(file).padStart(4, '0')}.bin`), content)
      ));
    }
  }
}

function parseArgs(args) {
  const values = { projects: 50, files: 20, bytes: 1024, runs: 5, concurrency: 8 };
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^--/, '');
    if (!(key in values) || args[index + 1] === undefined) fail(`Unknown or incomplete option: ${args[index]}`);
    const value = Number(args[index + 1]);
    if (!Number.isInteger(value) || value < 1) fail(`--${key} must be a positive integer.`);
    values[key] = value;
  }
  return values;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
