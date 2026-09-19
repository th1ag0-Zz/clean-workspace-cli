import { summarizeScan } from './scanSummary.js';

export const SCAN_JSON_SCHEMA_VERSION = 1;

export function createScanJson({ results, mode, workspaceRoot, filters, version }) {
  return {
    schemaVersion: SCAN_JSON_SCHEMA_VERSION,
    command: 'scan',
    cliVersion: version,
    scannedAt: new Date().toISOString(),
    scope: {
      mode,
      workspacePath: mode === 'system' ? null : workspaceRoot,
    },
    filters: {
      categories: filters.categories ?? [],
      risks: filters.risks ?? [],
    },
    summary: summarizeScan(results),
    targets: results.map((result) => ({
      id: result.target.id,
      category: result.target.category,
      risk: result.target.risk,
      label: result.target.label,
      description: result.target.description,
      scopeRoot: result.scopeRoot,
      itemCount: result.items.length,
      reclaimableBytes: result.items.reduce((total, item) => total + item.size, 0),
      items: result.items.map((item) => ({
        path: item.path,
        relativePath: item.relativePath ?? null,
        name: item.name,
        size: item.size,
        type: item.type,
        modifiedAt: item.modifiedAt,
      })),
    })),
  };
}

export function renderScanJson(options) {
  return `${JSON.stringify(createScanJson(options), null, 2)}\n`;
}
