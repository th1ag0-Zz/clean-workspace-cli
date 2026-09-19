import { stat, realpath } from 'node:fs/promises';
import os from 'node:os';
import { resolve } from 'node:path';
import inquirer from 'inquirer';
import { loadConfiguration } from '../core/config.js';
import { executeCleanupPlanWithSignals } from '../core/executor.js';
import { createReceipt, writeReceipt } from '../core/history.js';
import { CleanupPlan } from '../core/models.js';
import { SafetyPolicy } from '../core/safetyPolicy.js';
import { smartScan } from '../core/scanner.js';
import {
  CLEAN_JSON_SCHEMA_VERSION,
  renderCleanupPlan,
  renderCleanupResult,
} from '../reporters/cleanup.js';

export class CleanUsageError extends Error {}

export async function runCleanCommand(args, {
  version,
  cwd = process.cwd(),
  homeDir = os.homedir(),
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  scan = smartScan,
  executeWithSignals = executeCleanupPlanWithSignals,
  loadConfig = loadConfiguration,
  saveReceipt = writeReceipt,
  selectTargets = defaultTargetSelection,
  confirmApply = defaultConfirmation,
} = {}) {
  const wantsJson = args.includes('--json');
  try {
    const options = parseCleanArgs(args);
    if (options.help) {
      stdout.write(cleanHelp());
      return 0;
    }

    const workspaceRoot = await resolveWorkspacePath(options, cwd);
    const configuration = await loadConfig({ homeDir, workspaceRoot });
    const scanResults = await scan({
      mode: options.mode,
      workspaceRoot,
      homeDir,
      concurrency: configuration.config.concurrency,
      ignorePatterns: configuration.ignorePatterns,
      excludedPaths: configuration.excludedPaths,
    });

    const interactive = shouldSelectInteractively(options);
    let selectedResults;
    let preset = options.preset;
    if (interactive) {
      if (!stdin.isTTY) throw new CleanUsageError('Interactive cleanup requires a terminal. Use --dry-run or --apply.');
      const selectedIds = await selectTargets(scanResults);
      selectedResults = scanResults.filter((result) => selectedIds.includes(result.targetId));
      preset = null;
      if (selectedResults.length === 0) {
        stdout.write('Nothing selected. Cleanup cancelled.\n');
        return 0;
      }
    } else {
      preset ??= options.targets.length === 0 ? configuration.config.defaultPreset : null;
      selectedResults = selectByOptions(scanResults, options.targets, preset);
    }

    const plan = CleanupPlan.from(selectedResults);
    const sensitiveEntries = plan.entries.filter((entry) => entry.target.risk === 'sensitive');
    enforceSensitivePolicy(sensitiveEntries, options, configuration.config.sensitivePolicy);

    if (!options.apply && !interactive) {
      stdout.write(renderCleanupPlan({
        plan, preset, mode: options.mode, workspaceRoot, json: options.json,
      }));
      return 0;
    }

    if (!options.yes) {
      if (!stdin.isTTY) throw new CleanUsageError('--apply requires a terminal confirmation or --yes.');
      const approved = await confirmApply({ plan, sensitiveEntries });
      if (!approved) {
        stdout.write('Cleanup cancelled.\n');
        return 0;
      }
    }

    const policy = new SafetyPolicy({ homeDir, workspaceRoot: workspaceRoot ?? cwd });
    const { report, interrupted } = await executeWithSignals(plan, { policy });
    const receipt = createReceipt({ version, args, preset, plan, report });
    let receiptPath = null;
    let receiptError = null;
    try {
      receiptPath = await saveReceipt(receipt, { homeDir });
    } catch (error) {
      receiptError = error;
      stderr.write(`Warning: cleanup completed but its receipt could not be saved: ${error.message}\n`);
    }
    stdout.write(renderCleanupResult({ plan, report, receiptPath, json: options.json }));

    if (interrupted || report.aborted) return 130;
    if (report.failed > 0 || receiptError) return 1;
    return 0;
  } catch (error) {
    const usageError = error instanceof CleanUsageError;
    const exitCode = usageError ? 2 : 1;
    if (wantsJson) {
      stderr.write(`${JSON.stringify({
        schemaVersion: CLEAN_JSON_SCHEMA_VERSION,
        command: 'clean',
        error: { code: usageError ? 'INVALID_USAGE' : 'CLEAN_FAILED', message: error.message },
      })}\n`);
    } else {
      stderr.write(`Error: ${error.message}\n`);
      if (usageError) stderr.write('Run "cw clean --help" for usage.\n');
    }
    return exitCode;
  }
}

export function parseCleanArgs(args) {
  const options = {
    mode: 'workspace', path: null, preset: null, targets: [],
    dryRun: false, apply: false, yes: false, json: false, help: false,
  };
  let all = false;
  let system = false;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--all') all = true;
    else if (argument === '--system') system = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--apply') options.apply = true;
    else if (argument === '--yes') options.yes = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--preset' || argument.startsWith('--preset=')) {
      [options.preset, index] = optionValue(args, index, '--preset');
    } else if (argument === '--target' || argument.startsWith('--target=')) {
      const [value, nextIndex] = optionValue(args, index, '--target');
      options.targets.push(...csvValues(value));
      index = nextIndex;
    } else if (argument.startsWith('-')) throw new CleanUsageError(`Unknown option: ${argument}`);
    else if (options.path === null) options.path = argument;
    else throw new CleanUsageError('Only one workspace path can be cleaned.');
  }

  if (all && system) throw new CleanUsageError('--all and --system cannot be used together.');
  if (system && options.path !== null) throw new CleanUsageError('--system does not accept a workspace path.');
  if (options.apply && options.dryRun) throw new CleanUsageError('--apply and --dry-run cannot be used together.');
  if (options.yes && !options.apply) throw new CleanUsageError('--yes requires --apply.');
  if (options.json && options.apply && !options.yes) throw new CleanUsageError('--json --apply requires --yes.');
  if (options.preset && options.targets.length > 0) throw new CleanUsageError('--preset and --target cannot be combined.');
  if (options.preset && !['safe', 'deep'].includes(options.preset)) {
    throw new CleanUsageError('--preset must be "safe" or "deep".');
  }
  options.targets = [...new Set(options.targets)];
  options.mode = all ? 'all' : system ? 'system' : 'workspace';
  return options;
}

function selectByOptions(results, targetIds, preset) {
  if (targetIds.length > 0) {
    const known = new Set(results.map((result) => result.targetId));
    const unknown = targetIds.find((id) => !known.has(id));
    if (unknown) throw new CleanUsageError(`Unknown target "${unknown}" for the selected scope.`);
    return results.filter((result) => targetIds.includes(result.targetId) && result.items.length > 0);
  }
  const allowedRisks = preset === 'deep' ? new Set(['safe', 'review']) : new Set(['safe']);
  return results.filter((result) => allowedRisks.has(result.target.risk) && result.items.length > 0);
}

function enforceSensitivePolicy(entries, options, policy) {
  if (entries.length === 0) return;
  if (policy === 'deny') throw new CleanUsageError('Sensitive cleanup is disabled by configuration.');
  const selectedIds = new Set(options.targets);
  if (options.targets.length === 0 || entries.some((entry) => !selectedIds.has(entry.targetId))) {
    throw new CleanUsageError('Sensitive items require explicit selection with --target.');
  }
}

async function defaultTargetSelection(results) {
  const available = results.filter((result) => result.items.length > 0);
  const { selected } = await inquirer.prompt([{
    type: 'checkbox', name: 'selected', message: 'Select targets to clean:',
    choices: available.map((result) => ({
      name: `${result.target.label} (${result.target.risk}, ${result.items.length} item(s))`,
      value: result.targetId,
      checked: result.target.risk === 'safe',
    })),
  }]);
  return selected;
}

async function defaultConfirmation({ plan, sensitiveEntries }) {
  const { confirmed } = await inquirer.prompt([{
    type: 'confirm', name: 'confirmed', default: false,
    message: `Delete ${plan.entries.length} planned item(s)?`,
  }]);
  if (!confirmed) return false;
  if (sensitiveEntries.length === 0) return true;
  const phrase = `DELETE ${[...new Set(sensitiveEntries.map((entry) => entry.targetId))].join(',')}`;
  const { typed } = await inquirer.prompt([{
    type: 'input', name: 'typed', message: `Sensitive targets selected. Type "${phrase}" to continue:`,
  }]);
  return typed === phrase;
}

function shouldSelectInteractively(options) {
  return !options.apply && !options.dryRun && !options.json &&
    !options.preset && options.targets.length === 0;
}

async function resolveWorkspacePath(options, cwd) {
  if (options.mode === 'system') return null;
  const candidate = resolve(cwd, options.path ?? '.');
  try {
    const info = await stat(candidate);
    if (!info.isDirectory()) throw new CleanUsageError(`Workspace path is not a directory: ${candidate}`);
    return await realpath(candidate);
  } catch (error) {
    if (error instanceof CleanUsageError) throw error;
    throw new CleanUsageError(`Workspace path does not exist or cannot be read: ${candidate}`);
  }
}

function optionValue(args, index, name) {
  const argument = args[index];
  if (argument.startsWith(`${name}=`)) {
    const value = argument.slice(name.length + 1);
    if (!value) throw new CleanUsageError(`${name} requires a value.`);
    return [value, index];
  }
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new CleanUsageError(`${name} requires a value.`);
  return [value, index + 1];
}

function csvValues(value) {
  const values = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (values.length === 0) throw new CleanUsageError('Target values cannot be empty.');
  return values;
}

function cleanHelp() {
  return `Usage: cw clean [path] [options]\n\n` +
    `Options:\n` +
    `  --all                  Include workspace, global caches, and system locations\n` +
    `  --system               Use system locations only\n` +
    `  --preset safe|deep     Select a safe preset (deep excludes sensitive targets)\n` +
    `  --target <ids>         Select comma-separated target IDs\n` +
    `  --dry-run              Print the exact plan without deleting\n` +
    `  --apply                Execute the approved plan\n` +
    `  --yes                  Skip prompts (requires --apply)\n` +
    `  --json                 Emit schema-versioned JSON\n` +
    `  -h, --help             Show this help\n`;
}
