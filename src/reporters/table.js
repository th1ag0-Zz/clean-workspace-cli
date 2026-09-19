import chalk from 'chalk';
import { formatSize } from '../cleaners/scanner.js';
import { summarizeScan } from './scanSummary.js';

export function renderScanTable(results, {
  mode = 'workspace',
  workspaceRoot = process.cwd(),
} = {}) {
  const summary = summarizeScan(results);
  const lines = [];
  const scope = mode === 'system'
    ? 'system locations'
    : mode === 'all'
      ? `all sources (workspace: ${workspaceRoot})`
      : workspaceRoot;
  lines.push(chalk.bold(`Smart Scan — ${scope}`), '');

  for (const result of results.filter((entry) => entry.items.length > 0)) {
    const size = result.items.reduce((total, item) => total + item.size, 0);
    lines.push(
      `${result.target.icon} ${chalk.bold(result.target.label)}` +
      chalk.dim(`  ${result.target.category} / ${result.target.risk}  `) +
      chalk.yellow(`${result.items.length} item(s), ${formatSize(size)}`)
    );
    for (const item of result.items.slice(0, 3)) {
      lines.push(`   ${chalk.dim(item.relativePath ?? item.path)}`);
    }
    if (result.items.length > 3) {
      lines.push(`   ${chalk.dim(`... and ${result.items.length - 3} more`)}`);
    }
    lines.push('');
  }

  if (summary.itemCount === 0) lines.push(chalk.green('✓ Nothing to clean.'), '');
  lines.push(
    `${chalk.bold('Summary:')} ${summary.itemCount} item(s) across ` +
    `${summary.targetCount} target(s), ${chalk.green.bold(formatSize(summary.reclaimableBytes))} reclaimable`
  );
  lines.push(`${chalk.bold('Recommendation:')} ${summary.recommendation.message}`);
  return `${lines.join('\n')}\n`;
}
