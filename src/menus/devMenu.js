import { createRequire } from 'node:module';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { formatSize } from '../cleaners/scanner.js';
import { loadConfiguration } from '../core/config.js';
import { executeCleanupPlanWithSignals } from '../core/executor.js';
import { createReceipt, writeReceipt } from '../core/history.js';
import { CleanupPlan } from '../core/models.js';
import { smartScan } from '../core/scanner.js';
import { renderScanTable } from '../reporters/table.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

export async function showDevCleanMenu() {
  console.clear();
  printDevHeader();

  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: chalk.bold('Choose an action:'),
    choices: [
      { name: `${chalk.yellow('🔍')} Scan current folder  ${chalk.dim('(see what can be cleaned)')}`, value: 'scan' },
      { name: `${chalk.red('🧹')} Quick clean          ${chalk.dim('(pick targets and delete)')}`, value: 'clean' },
      { name: `${chalk.blue('🌐')} Global caches        ${chalk.dim('(npm, yarn, pnpm, bun...)')}`, value: 'global' },
      new inquirer.Separator(chalk.dim('─────────────────────────────────────')),
      { name: chalk.dim('← Back to main menu'), value: 'back' },
    ],
  }]);

  if (action === 'scan') await runScan();
  else if (action === 'clean') await runClean();
  else if (action === 'global') await runGlobalClean();
}

async function runScan() {
  console.log();
  const spinner = ora({ text: chalk.dim(`Scanning ${process.cwd()} ...`), color: 'cyan' }).start();
  const results = await configuredScan({ mode: 'workspace' });
  spinner.stop();
  console.log(`\n${renderScanTable(results, {
    mode: 'workspace',
    workspaceRoot: process.cwd(),
  }).trimEnd()}\n`);
  await promptContinue();
  return showDevCleanMenu();
}

async function runClean() {
  console.log();
  const spinner = ora({ text: chalk.dim('Scanning...'), color: 'cyan' }).start();
  const results = await configuredScan({ mode: 'workspace' });
  spinner.stop();

  const available = results.filter((result) => result.items.length > 0);
  if (available.length === 0) {
    console.log(chalk.green('\n  ✓ Nothing found to clean!\n'));
    await promptContinue();
    return showDevCleanMenu();
  }

  const { selected } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selected',
    message: chalk.bold('Select what to delete:'),
    choices: available.map((result) => ({
      name:
        `${result.target.icon} ${chalk.bold(result.target.label)}` +
        chalk.dim(` (${result.items.length} found) `) +
        chalk.yellow(formatSize(sumSize(result.items))),
      value: result,
      checked: false,
    })),
    pageSize: 15,
  }]);
  if (selected.length === 0) return cancelAndReturn('Nothing selected. Cancelled.');

  const plan = CleanupPlan.from(selected);
  const totalSize = plan.entries.reduce((total, entry) => total + entry.size, 0);
  console.log();
  const { confirmed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmed',
    message: chalk.red.bold(`Delete ${plan.entries.length} folders`) + chalk.dim(` (${formatSize(totalSize)})?`),
    default: false,
  }]);
  if (!confirmed) return cancelAndReturn('Cancelled.');

  const report = await executeWithSpinner(plan, 'Cleaning selected folders...');
  console.log();
  console.log(
    chalk.bold(`  ✓ Done! Deleted ${report.deleted} folder(s), freed `) +
    chalk.green.bold(formatSize(report.freed))
  );
  console.log();
  await promptContinue();
  return showDevCleanMenu();
}

async function runGlobalClean() {
  console.log();
  const spinner = ora({ text: chalk.dim('Checking global caches...'), color: 'cyan' }).start();
  const results = await configuredScan({ mode: 'all', categories: ['global-cache'] });
  spinner.stop();

  const { selected } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selected',
    message: chalk.bold('Select global caches to clear:'),
    choices: results.map((result) => {
      const size = sumSize(result.items);
      return {
        name:
          `${result.target.icon} ${chalk.bold(result.target.label)}` +
          chalk.dim(`  ${result.target.description}  `) +
          (size > 0 ? chalk.yellow(formatSize(size)) : chalk.dim('n/a')),
        value: result,
        checked: false,
        disabled: result.items.length === 0 ? chalk.dim('not found') : false,
      };
    }),
    pageSize: 15,
  }]);
  if (selected.length === 0) return cancelAndReturn('Nothing selected.');

  const { confirmed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmed',
    message: chalk.red.bold(`Clear ${selected.length} global cache(s)?`),
    default: false,
  }]);
  if (!confirmed) return cancelAndReturn('Cancelled.');

  const report = await executeWithSpinner(CleanupPlan.from(selected), 'Clearing global caches...');
  console.log();
  if (report.failed === 0) console.log(chalk.bold('  ✓ Global caches cleared!'));
  else console.log(chalk.yellow.bold(`  Cleanup finished with ${report.failed} failed item(s).`));
  console.log();
  await promptContinue();
  return showDevCleanMenu();
}

async function executeWithSpinner(plan, message) {
  console.log();
  const spinner = ora({ text: message, color: 'cyan' }).start();
  const { report } = await executeCleanupPlanWithSignals(plan, {
    onItem: (_result, completed, total) => {
      spinner.text = `${message} ${completed}/${total}`;
    },
  });
  let receiptPath = null;
  try {
    const receipt = createReceipt({
      version, args: ['interactive'], preset: null, plan, report,
    });
    receiptPath = await writeReceipt(receipt);
  } catch (error) {
    console.log(chalk.yellow(`  Warning: cleanup receipt could not be saved: ${error.message}`));
  }
  if (report.aborted) spinner.warn(chalk.yellow(`Interrupted — ${report.deleted} deleted, ${report.skipped} skipped`));
  else if (report.failed === 0) spinner.succeed(chalk.green(`${report.deleted} item(s) deleted`));
  else spinner.warn(chalk.yellow(`${report.deleted} deleted, ${report.failed} failed`));
  if (receiptPath) console.log(chalk.dim(`  Receipt: ${receiptPath}`));
  return report;
}

async function configuredScan({ mode, categories }) {
  const workspaceRoot = process.cwd();
  const loaded = await loadConfiguration({ workspaceRoot });
  return smartScan({
    mode,
    categories,
    workspaceRoot,
    concurrency: loaded.config.concurrency,
    ignorePatterns: loaded.ignorePatterns,
    excludedPaths: loaded.excludedPaths,
  });
}

async function cancelAndReturn(message) {
  console.log(chalk.dim(`\n  ${message}\n`));
  await promptContinue();
  return showDevCleanMenu();
}

function sumSize(items) {
  return items.reduce((total, item) => total + item.size, 0);
}

function printDevHeader() {
  console.log();
  console.log(
    `  ${chalk.yellow('⚡')} ${chalk.bold('Dev Cleanup')}  ` +
    chalk.dim(`scanning: ${chalk.cyan(process.cwd())}`)
  );
  console.log(chalk.dim('  ─────────────────────────────────────────────'));
  console.log();
}

async function promptContinue() {
  await inquirer.prompt([{ type: 'input', name: '_', message: chalk.dim('Press Enter to continue...') }]);
}
