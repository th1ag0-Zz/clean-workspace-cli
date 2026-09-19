#!/usr/bin/env node

import { createRequire } from 'module';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { runCli } from './commands/cli.js';
import { showDevCleanMenu } from './menus/devMenu.js';
import { showHistoryMenu } from './menus/historyMenu.js';
import { showSmartScanMenu } from './menus/smartScanMenu.js';
import { showSystemCleanMenu } from './menus/systemMenu.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const LOGO = `
${chalk.cyan.bold('  ╭──────────────────────────╮')}
${chalk.cyan.bold('  │        devclean 2.0       │')}
${chalk.cyan.bold('  ╯──────────────────────────╯')}
`;

const SUBTITLE = chalk.gray('  Your dev environment deserves a deep clean.');
const VERSION = chalk.dim(`  v${version}`);

async function main(args = process.argv.slice(2)) {
  if (args.length > 0) {
    process.exitCode = await runCli(args, {
      version,
      stdout: process.stdout,
      stderr: process.stderr,
    });
    return;
  }

  console.clear();
  console.log(LOGO);
  console.log(SUBTITLE);
  console.log(VERSION);
  console.log();

  while (await showMainMenu()) {
    // Cleanup menus return here so the user can choose another section.
  }
}

async function showMainMenu() {
  const { option } = await inquirer.prompt([
    {
      type: 'list',
      name: 'option',
      message: chalk.bold('What would you like to do?'),
      choices: [
        {
          name: `${chalk.cyan('◉')} ${chalk.bold('Smart Scan')}           ${chalk.dim('one read-only view of all reclaimable space')}`,
          value: 'scan',
        },
        {
          name: `${chalk.yellow('⚡')} ${chalk.bold('Dev Cleanup')}          ${chalk.dim('node_modules, .next, dist, caches...')}`,
          value: 'dev',
        },
        {
          name: `${chalk.blue('🖥 ')} ${chalk.bold('System Cleanup')}       ${chalk.dim('Trash, Downloads, app and macOS caches...')}`,
          value: 'system',
        },
        {
          name: `${chalk.magenta('◷')} ${chalk.bold('Cleanup History')}       ${chalk.dim('receipts and partial failures')}`,
          value: 'history',
        },
        new inquirer.Separator(chalk.dim('─────────────────────────────────────')),
        {
          name: `${chalk.dim('✕  Exit')}`,
          value: 'exit',
        },
      ],
    },
  ]);

  switch (option) {
    case 'scan':
      await showSmartScanMenu();
      return true;
    case 'dev':
      await showDevCleanMenu();
      return true;
    case 'system':
      await showSystemCleanMenu();
      return true;
    case 'history':
      await showHistoryMenu();
      return true;
    case 'exit':
      console.log(chalk.dim('\n  Bye! Keep your env clean. 🧹\n'));
      return false;
  }
}

main().catch((err) => {
  console.error(chalk.red('\n  Unexpected error:'), err.message);
  process.exitCode = 1;
});
