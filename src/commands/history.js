import os from 'node:os';
import { readHistory } from '../core/history.js';
import { formatSize } from '../cleaners/scanner.js';

export async function runHistoryCommand(args, {
  homeDir = os.homedir(),
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  let json = false;
  let limit = 20;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--json') json = true;
    else if (argument === '--limit') {
      limit = Number(args[++index]);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        stderr.write('Error: --limit must be an integer from 1 to 100.\n');
        return 2;
      }
    } else {
      stderr.write(`Error: Unknown history option: ${argument}\n`);
      return 2;
    }
  }

  try {
    const receipts = await readHistory({ homeDir, limit });
    if (json) stdout.write(`${JSON.stringify({ schemaVersion: 1, command: 'history', receipts }, null, 2)}\n`);
    else stdout.write(formatHistory(receipts));
    return 0;
  } catch (error) {
    stderr.write(`Error: ${error.message}\n`);
    return 1;
  }
}

function formatHistory(receipts) {
  if (receipts.length === 0) return 'No cleanup history found.\n';
  const lines = ['Cleanup history', ''];
  for (const receipt of receipts) {
    lines.push(
      `${receipt.timestamp}  ${receipt.deleted} deleted, ${receipt.failed} failed, ` +
      `${formatSize(receipt.recoveredBytes)} recovered  [${receipt.id}]`
    );
  }
  return `${lines.join('\n')}\n`;
}
