import { resolve } from 'node:path';

export class ScanResult {
  constructor({ target, scopeRoot, items, scannedAt = new Date().toISOString() }) {
    if (!target?.id || !scopeRoot || !Array.isArray(items)) {
      throw new TypeError('A scan result requires a target, scope root, and items.');
    }

    this.target = target;
    this.targetId = target.id;
    this.scopeRoot = resolve(scopeRoot);
    this.scannedAt = scannedAt;
    this.items = Object.freeze(items.map((item) => Object.freeze({
      ...item,
      fingerprint: item.fingerprint ? Object.freeze({ ...item.fingerprint }) : undefined,
    })));
    Object.freeze(this);
  }
}

export class CleanupPlan {
  constructor(scanResults) {
    if (!Array.isArray(scanResults) || !scanResults.every((result) => result instanceof ScanResult)) {
      throw new TypeError('A cleanup plan can only be created from scan results.');
    }

    this.createdAt = new Date().toISOString();
    this.targetIds = Object.freeze(scanResults.map((result) => result.targetId));
    const entries = scanResults.flatMap((result) =>
      result.items.map((item) => Object.freeze({
        ...item,
        targetId: result.targetId,
        target: result.target,
        allowedRoots: Object.freeze([result.scopeRoot]),
      }))
    );
    this.entries = Object.freeze([...new Map(entries.map((entry) => [entry.path, entry])).values()]);
    Object.freeze(this);
  }

  static from(scanResults) {
    return new CleanupPlan(scanResults);
  }
}
