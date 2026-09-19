import { stat, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfiguration } from '../core/config.js';
import { smartScan } from '../core/scanner.js';
import { renderScanJson, SCAN_JSON_SCHEMA_VERSION } from '../reporters/json.js';
import { renderScanTable } from '../reporters/table.js';

const CATEGORIES = new Set(['workspace', 'global-cache', 'system']);
const RISKS = new Set(['safe', 'review', 'sensitive']);

export class ScanUsageError extends Error {}

export async function runScanCommand(args, {
  version,
  cwd = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
  scan = smartScan,
  loadConfig = loadConfiguration,
  homeDir,
} = {}) {
  const wantsJson = args.includes('--json');
  try {
    const options = parseScanArgs(args);
    if (options.help) {
      stdout.write(scanHelp());
      return 0;
    }

    const workspaceRoot = await resolveWorkspacePath(options, cwd);
    const configuration = await loadConfig({ homeDir, workspaceRoot });
    const results = await scan({
      mode: options.mode,
      workspaceRoot,
      categories: options.categories,
      risks: options.risks,
      homeDir,
      concurrency: configuration.config.concurrency,
      ignorePatterns: configuration.ignorePatterns,
      excludedPaths: configuration.excludedPaths,
    });
    const reportOptions = {
      results,
      mode: options.mode,
      workspaceRoot,
      filters: { categories: options.categories, risks: options.risks },
      version,
    };
    stdout.write(options.json ? renderScanJson(reportOptions) : renderScanTable(results, reportOptions));
    return 0;
  } catch (error) {
    const usageError = error instanceof ScanUsageError;
    const exitCode = usageError ? 2 : 1;
    if (wantsJson) {
      stderr.write(`${JSON.stringify({
        schemaVersion: SCAN_JSON_SCHEMA_VERSION,
        command: 'scan',
        error: { code: usageError ? 'INVALID_USAGE' : 'SCAN_FAILED', message: error.message },
      })}\n`);
    } else {
      stderr.write(`Error: ${error.message}\n`);
      if (usageError) stderr.write('Run "cw scan --help" for usage.\n');
    }
    return exitCode;
  }
}

export function parseScanArgs(args) {
  const options = {
    mode: 'workspace',
    path: null,
    json: false,
    help: false,
    categories: [],
    risks: [],
  };
  let all = false;
  let system = false;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--all') all = true;
    else if (argument === '--system') system = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--category' || argument.startsWith('--category=')) {
      const [value, nextIndex] = optionValue(args, index, '--category');
      options.categories.push(...csvValues(value));
      index = nextIndex;
    } else if (argument === '--risk' || argument.startsWith('--risk=')) {
      const [value, nextIndex] = optionValue(args, index, '--risk');
      options.risks.push(...csvValues(value));
      index = nextIndex;
    } else if (argument.startsWith('-')) {
      throw new ScanUsageError(`Unknown option: ${argument}`);
    } else if (options.path === null) {
      options.path = argument;
    } else {
      throw new ScanUsageError('Only one workspace path can be scanned.');
    }
  }

  if (all && system) throw new ScanUsageError('--all and --system cannot be used together.');
  if (system && options.path !== null) throw new ScanUsageError('--system does not accept a workspace path.');
  validateValues(options.categories, CATEGORIES, 'category');
  validateValues(options.risks, RISKS, 'risk');
  options.categories = [...new Set(options.categories)];
  options.risks = [...new Set(options.risks)];
  options.mode = all ? 'all' : system ? 'system' : 'workspace';
  return options;
}

async function resolveWorkspacePath(options, cwd) {
  if (options.mode === 'system') return null;
  const candidate = resolve(cwd, options.path ?? '.');
  try {
    const info = await stat(candidate);
    if (!info.isDirectory()) throw new ScanUsageError(`Workspace path is not a directory: ${candidate}`);
    return await realpath(candidate);
  } catch (error) {
    if (error instanceof ScanUsageError) throw error;
    throw new ScanUsageError(`Workspace path does not exist or cannot be read: ${candidate}`);
  }
}

function optionValue(args, index, name) {
  const argument = args[index];
  if (argument.startsWith(`${name}=`)) {
    const value = argument.slice(name.length + 1);
    if (!value) throw new ScanUsageError(`${name} requires a value.`);
    return [value, index];
  }
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new ScanUsageError(`${name} requires a value.`);
  return [value, index + 1];
}

function csvValues(value) {
  const values = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (values.length === 0) throw new ScanUsageError('Filter values cannot be empty.');
  return values;
}

function validateValues(values, allowed, label) {
  const invalid = values.find((value) => !allowed.has(value));
  if (invalid) {
    throw new ScanUsageError(
      `Unknown ${label} "${invalid}". Allowed values: ${[...allowed].join(', ')}.`
    );
  }
}

function scanHelp() {
  return `Usage: cw scan [path] [options]\n\n` +
    `Options:\n` +
    `  --all                  Scan workspace, global caches, and system locations\n` +
    `  --system               Scan system locations only\n` +
    `  --category <values>    Filter: workspace, global-cache, system\n` +
    `  --risk <values>        Filter: safe, review, sensitive\n` +
    `  --json                 Emit schema-versioned JSON\n` +
    `  -h, --help             Show this help\n`;
}
