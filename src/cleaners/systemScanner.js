import os from 'node:os';
import { scanSystem } from '../core/scanner.js';
import { DEFAULT_MIN_AGE_DAYS, getSystemTargets } from '../core/targets.js';

export { DEFAULT_MIN_AGE_DAYS, getSystemTargets };

/** @deprecated Use scanSystem from core/scanner.js. */
export async function scanSystemTargets({ homeDir = os.homedir(), now = Date.now() } = {}) {
  const results = await scanSystem({ homeDir, now });
  return results.map((result) => ({ ...result.target, items: result.items }));
}
