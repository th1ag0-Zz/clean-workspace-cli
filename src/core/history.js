import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';

export const RECEIPT_SCHEMA_VERSION = 1;

export function getHistoryDir(homeDir = os.homedir()) {
  return join(homeDir, '.config', 'devclean', 'history');
}

export function createReceipt({
  version,
  args,
  preset,
  plan,
  report,
  timestamp = new Date().toISOString(),
  id = randomUUID(),
}) {
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    id,
    timestamp,
    cliVersion: version,
    command: 'clean',
    arguments: [...args],
    preset: preset ?? null,
    targets: [...plan.targetIds],
    paths: plan.entries.map((entry) => entry.path),
    estimatedBytes: plan.entries.reduce((total, entry) => total + entry.size, 0),
    recoveredBytes: report.freed,
    deleted: report.deleted,
    failed: report.failed,
    skipped: report.skipped,
    aborted: report.aborted,
    results: report.results.map((result) => ({
      path: result.entry.path,
      targetId: result.entry.targetId,
      status: result.status,
      estimatedBytes: result.entry.size,
      recoveredBytes: result.freed,
      error: result.error ? {
        code: result.error.code ?? result.error.name ?? 'ERROR',
        message: result.error.message,
      } : null,
    })),
    errors: report.results
      .filter((result) => result.error)
      .map((result) => ({
        path: result.entry.path,
        code: result.error.code ?? result.error.name ?? 'ERROR',
        message: result.error.message,
      })),
  };
}

export async function writeReceipt(receipt, { homeDir = os.homedir(), historyDir = getHistoryDir(homeDir) } = {}) {
  await mkdir(historyDir, { recursive: true });
  const safeTimestamp = receipt.timestamp.replace(/[:.]/g, '-');
  const path = join(historyDir, `${safeTimestamp}-${receipt.id}.json`);
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return path;
}

export async function readHistory({
  homeDir = os.homedir(),
  historyDir = getHistoryDir(homeDir),
  limit = 20,
} = {}) {
  let names;
  try {
    names = await readdir(historyDir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const selected = names.filter((name) => name.endsWith('.json')).sort().reverse().slice(0, limit);
  const receipts = await Promise.all(selected.map(async (name) => {
    try {
      return JSON.parse(await readFile(join(historyDir, name), 'utf8'));
    } catch {
      return null;
    }
  }));
  return receipts.filter(Boolean);
}
