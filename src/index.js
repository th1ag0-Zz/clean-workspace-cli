#!/usr/bin/env node

import { createRequire } from 'module';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { showDevCleanMenu } from './menus/devMenu.js';
import { showSystemCleanMenu } from './menus/systemMenu.js';

const LOGO = `
${chalk.cyan('██╗    ██╗██╗██████╗ ███████╗    ██████╗ ███████╗██╗   ██╗')}
${chalk.cyan('██║    ██║██║██╔══██╗██╔════╝    ██╔══██╗██╔════╝██║   ██║')}
${chalk.cyan('██║ █╗ ██║██║██████╔╝█████╗      ██║  ██║█████╗  ██║   ██║')}
${chalk.cyan('██║███╗██║██║██╔═══╝ ██╔══╝      ██║  ██║██╔══╝  ╚██╗ ██╔╝')}
${chalk.cyan('╚███╔███╔╝██║██║     ███████╗    ██████╔╝███████╗ ╚████╔╝ ')}
${chalk.cyan(' ╚══╝╚══╝ ╚═╝╚═╝     ╚══════╝    ╚═════╝ ╚══════╝  ╚═══╝  ')}
`;

const SUBTITLE = chalk.gray('  Your dev environment deserves a deep clean.');
const VERSION = chalk.dim('  v1.0.0');

async function main() {
  console.clear();
  console.log(LOGO);
  console.log(SUBTITLE);
  console.log(VERSION);
  console.log();

  await showMainMenu();
}

async function showMainMenu() {
  const { option } = await inquirer.prompt([
    {
      type: 'list',
      name: 'option',
      message: chalk.bold('What do you want to clean?'),
      choices: [
        {
          name: `${chalk.yellow('⚡')} ${chalk.bold('Dev Cleanup')}          ${chalk.dim('node_modules, .next, dist, caches...')}`,
          value: 'dev',
        },
        {
          name: `${chalk.blue('🖥 ')} ${chalk.bold('System Cleanup')}       ${chalk.dim('coming soon...')}`,
          value: 'system',
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
    case 'dev':
      await showDevCleanMenu();
      break;
    case 'system':
      await showSystemCleanMenu();
      break;
    case 'exit':
      console.log(chalk.dim('\n  Bye! Keep your env clean. 🧹\n'));
      process.exit(0);
  }
}

main().catch((err) => {
  console.error(chalk.red('\n  Unexpected error:'), err.message);
  process.exit(1);
});
