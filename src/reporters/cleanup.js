import chalk from 'chalk';
import { formatSize } from '../cleaners/scanner.js';

export const CLEAN_JSON_SCHEMA_VERSION = 1;

export function cleanupPlanDocument({ plan, preset, mode, workspaceRoot, applied = false }) {
  return {
    schemaVersion: CLEAN_JSON_SCHEMA_VERSION,
    command: 'clean',
    applied,
    preset: preset ?? null,
    scope: { mode, workspacePath: mode === 'system' ? null : workspaceRoot },
    summary: {
      targetCount: plan.targetIds.length,
      itemCount: plan.entries.length,
      estimatedBytes: plan.entries.reduce((total, entry) => total + entry.size, 0),
      sensitiveItemCount: plan.entries.filter((entry) => entry.target.risk === 'sensitive').length,
    },
    targets: [...plan.targetIds],
    items: plan.entries.map((entry) => ({
      path: entry.path,
      targetId: entry.targetId,
      risk: entry.target.risk,
      size: entry.size,
      type: entry.type,
    })),
  };
}

export function renderCleanupPlan({ plan, preset, mode, workspaceRoot, json = false }) {
  const document = cleanupPlanDocument({ plan, preset, mode, workspaceRoot });
  if (json) return `${JSON.stringify(document, null, 2)}\n`;

  const lines = [chalk.bold('Cleanup plan'), ''];
  for (const item of document.items) {
    lines.push(
      `${riskIcon(item.risk)} ${item.targetId}  ${chalk.dim(item.path)}  ` +
      chalk.yellow(formatSize(item.size))
    );
  }
  if (document.items.length === 0) lines.push(chalk.green('✓ No matching items.'), '');
  lines.push(
    `${chalk.bold('Plan:')} ${document.summary.itemCount} item(s), ` +
    `${formatSize(document.summary.estimatedBytes)} estimated`
  );
  lines.push(chalk.dim('Nothing was deleted. Use --apply to execute this exact plan.'));
  return `${lines.join('\n')}\n`;
}

export function renderCleanupResult({ plan, report, receiptPath, json = false }) {
  const document = {
    schemaVersion: CLEAN_JSON_SCHEMA_VERSION,
    command: 'clean',
    applied: true,
    summary: {
      planned: plan.entries.length,
      deleted: report.deleted,
      failed: report.failed,
      skipped: report.skipped,
      recoveredBytes: report.freed,
      aborted: report.aborted,
    },
    results: report.results.map((result) => ({
      path: result.entry.path,
      targetId: result.entry.targetId,
      status: result.status,
      recoveredBytes: result.freed,
      error: result.error?.message ?? null,
    })),
    receiptPath,
  };
  if (json) return `${JSON.stringify(document, null, 2)}\n`;
  return `${chalk.bold('Cleanup complete:')} ${report.deleted} deleted, ` +
    `${report.failed} failed, ${report.skipped} skipped, ` +
    `${chalk.green(formatSize(report.freed))} recovered\n` +
    `${chalk.dim(receiptPath ? `Receipt: ${receiptPath}` : 'Receipt unavailable')}\n`;
}

function riskIcon(risk) {
  if (risk === 'sensitive') return '⚠';
  if (risk === 'review') return '◆';
  return '✓';
}
