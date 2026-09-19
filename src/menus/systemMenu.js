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

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

export async function showSystemCleanMenu() {
  console.clear();
  printHeader();

  if (process.platform !== 'darwin') {
    console.log(chalk.yellow('  System Cleanup currently supports macOS only.\n'));
    await promptContinue();
    return;
  }

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.bold('Choose an action:'),
      choices: [
        {
          name: `${chalk.blue('🔍')} Scan and clean  ${chalk.dim('(Trash, Downloads, logs and caches)')}`,
          value: 'clean',
        },
        new inquirer.Separator(chalk.dim('─────────────────────────────────────')),
        { name: chalk.dim('← Back to main menu'), value: 'back' },
      ],
    },
  ]);

  if (action === 'clean') await runSystemClean();
}

async function runSystemClean() {
  console.log();
  const spinner = ora({ text: chalk.dim('Scanning system locations...'), color: 'cyan' }).start();
  const loaded = await loadConfiguration({ workspaceRoot: process.cwd() });
  const targets = await smartScan({
    mode: 'system',
    concurrency: loaded.config.concurrency,
    excludedPaths: loaded.excludedPaths,
  });
  spinner.stop();

  const availableTargets = targets.filter((target) => target.items.length > 0);

  if (availableTargets.length === 0) {
    console.log(chalk.green('\n  ✓ Nothing safe to clean. Your system is spotless!\n'));
    await promptContinue();
    return;
  }

  console.log();
  for (const target of availableTargets) {
    console.log(
      `  ${target.target.icon} ${chalk.bold(target.target.label)}` +
      chalk.dim(` — ${target.items.length} item(s) — `) +
      chalk.yellow(formatSize(sumSize(target.items)))
    );
    for (const item of target.items.slice(0, 3)) {
      console.log(`     ${chalk.dim(item.name)}`);
    }
    if (target.items.length > 3) {
      console.log(`     ${chalk.dim(`... and ${target.items.length - 3} more`)}`);
    }
    console.log();
  }

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: chalk.bold('Select what to delete:'),
      choices: availableTargets.map((target) => {
        const size = sumSize(target.items);
        return {
          name:
            `${target.target.icon} ${chalk.bold(target.target.label)}` +
            chalk.dim(` — ${target.items.length} item(s) — `) +
            chalk.yellow(formatSize(size)) +
            chalk.dim(`  ${target.target.description}`),
          value: target,
          checked: false,
        };
      }),
      pageSize: 10,
    },
  ]);

  if (selected.length === 0) {
    console.log(chalk.dim('\n  Nothing selected. Cancelled.\n'));
    await promptContinue();
    return;
  }

  if (loaded.config.sensitivePolicy === 'deny') {
    console.log(chalk.yellow('\n  Sensitive cleanup is disabled by configuration.\n'));
    await promptContinue();
    return;
  }

  const plan = CleanupPlan.from(selected);
  const itemCount = plan.entries.length;
  const totalSize = plan.entries.reduce((total, item) => total + item.size, 0);

  console.log();
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message:
        chalk.red.bold(`Permanently delete ${itemCount} item(s)`) +
        chalk.dim(` (${formatSize(totalSize)})? This cannot be undone.`),
      default: false,
    },
  ]);

  if (!confirmed) {
    console.log(chalk.dim('\n  Cancelled.\n'));
    await promptContinue();
    return;
  }

  const { reinforced } = await inquirer.prompt([{
    type: 'input',
    name: 'reinforced',
    message: 'Sensitive system items selected. Type "DELETE SENSITIVE" to continue:',
  }]);
  if (reinforced !== 'DELETE SENSITIVE') {
    console.log(chalk.dim('\n  Confirmation did not match. Cancelled.\n'));
    await promptContinue();
    return;
  }

  console.log();
  const targetSpinner = ora({ text: 'Cleaning selected system items...', color: 'cyan' }).start();
  const { report } = await executeCleanupPlanWithSignals(plan, {
    onItem: (_result, completed, total) => {
      targetSpinner.text = `Cleaning selected system items... ${completed}/${total}`;
    },
  });
  let receiptPath = null;
  try {
    const receipt = createReceipt({
      version, args: ['interactive', '--system'], preset: null, plan, report,
    });
    receiptPath = await writeReceipt(receipt);
  } catch (error) {
    console.log(chalk.yellow(`  Warning: cleanup receipt could not be saved: ${error.message}`));
  }
  if (report.aborted) targetSpinner.warn(chalk.yellow(`Interrupted — ${report.deleted} deleted, ${report.skipped} skipped`));
  else if (report.failed === 0) targetSpinner.succeed(chalk.green(`${report.deleted} item(s) deleted`));
  else targetSpinner.warn(chalk.yellow(`${report.deleted} deleted, ${report.failed} failed`));
  if (receiptPath) console.log(chalk.dim(`  Receipt: ${receiptPath}`));

  console.log();
  console.log(
    chalk.bold(`  ✓ Done! Deleted ${report.deleted} item(s), freed `) +
    chalk.green.bold(formatSize(report.freed))
  );
  console.log();
  await promptContinue();
}

function sumSize(items) {
  return items.reduce((total, item) => total + item.size, 0);
}

function printHeader() {
  console.log();
  console.log(`  ${chalk.blue('🖥 ')} ${chalk.bold('System Cleanup')}  ${chalk.dim('macOS')}`);
  console.log(chalk.dim('  ────────────────────────────────────────────'));
  console.log();
}

async function promptContinue() {
  await inquirer.prompt([
    {
      type: 'input',
      name: '_',
      message: chalk.dim('Press Enter to continue...'),
    },
  ]);
}
