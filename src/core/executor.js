import { rm } from 'node:fs/promises';
import { CleanupPlan } from './models.js';
import { SafetyPolicy } from './safetyPolicy.js';

export async function executeCleanupPlan(plan, {
  policy = new SafetyPolicy(),
  signal,
  onItem,
} = {}) {
  if (!(plan instanceof CleanupPlan)) {
    throw new TypeError('The executor only accepts a CleanupPlan.');
  }

  const results = [];
  for (const entry of plan.entries) {
    if (signal?.aborted) {
      const error = new Error('Cleanup interrupted before this item was processed.');
      error.name = 'AbortError';
      error.code = 'ABORTED';
      results.push({ entry, success: false, status: 'skipped', freed: 0, error });
      await onItem?.(results.at(-1), results.length, plan.entries.length);
      continue;
    }
    try {
      const validated = await policy.validate(entry);
      await rm(validated.path, {
        recursive: validated.type === 'directory',
        force: false,
      });
      results.push({ entry, success: true, status: 'deleted', freed: entry.size });
    } catch (error) {
      results.push({ entry, success: false, status: 'failed', freed: 0, error });
    }
    await onItem?.(results.at(-1), results.length, plan.entries.length);
  }

  return Object.freeze({
    results: Object.freeze(results),
    deleted: results.filter((result) => result.success).length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    aborted: signal?.aborted ?? false,
    freed: results.reduce((total, result) => total + result.freed, 0),
  });
}

export async function executeCleanupPlanWithSignals(plan, options = {}) {
  const controller = new AbortController();
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    controller.abort();
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const report = await executeCleanupPlan(plan, { ...options, signal: controller.signal });
    return { report, interrupted };
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
