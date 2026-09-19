import chalk from 'chalk';
import inquirer from 'inquirer';
import { runHistoryCommand } from '../commands/history.js';

export async function showHistoryMenu() {
  console.clear();
  console.log(`\n  ${chalk.magenta('◷')} ${chalk.bold('Cleanup History')}\n`);
  await runHistoryCommand([], { stdout: process.stdout, stderr: process.stderr });
  console.log();
  await inquirer.prompt([{
    type: 'input', name: '_', message: chalk.dim('Press Enter to return to the dashboard...'),
  }]);
}
