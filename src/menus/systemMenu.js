import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { formatSize } from '../cleaners/scanner.js';
import { deleteDir } from '../cleaners/cleaner.js';
import { scanSystemTargets } from '../cleaners/systemScanner.js';

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
  const targets = await scanSystemTargets();
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
      `  ${target.icon} ${chalk.bold(target.label)}` +
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
            `${target.icon} ${chalk.bold(target.label)}` +
            chalk.dim(` — ${target.items.length} item(s) — `) +
            chalk.yellow(formatSize(size)) +
            chalk.dim(`  ${target.description}`),
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

  const itemCount = selected.reduce((total, target) => total + target.items.length, 0);
  const totalSize = selected.reduce((total, target) => total + sumSize(target.items), 0);

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

  console.log();
  let deleted = 0;
  let freed = 0;

  for (const target of selected) {
    const targetSpinner = ora({ text: `Cleaning ${target.label}...`, color: 'cyan' }).start();
    let failed = 0;

    for (const item of target.items) {
      const result = deleteDir(item.path);
      if (result.success && !result.skipped) {
        deleted++;
        freed += item.size;
      } else if (!result.success) {
        failed++;
      }
    }

    if (failed === 0) {
      targetSpinner.succeed(chalk.green(`${target.icon} ${target.label} cleared`));
    } else {
      targetSpinner.warn(
        chalk.yellow(`${target.icon} ${target.label}`) + chalk.dim(` — ${failed} item(s) failed`)
      );
    }
  }

  console.log();
  console.log(
    chalk.bold(`  ✓ Done! Deleted ${deleted} item(s), freed `) +
    chalk.green.bold(formatSize(freed))
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
