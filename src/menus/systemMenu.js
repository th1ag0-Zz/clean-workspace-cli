import chalk from 'chalk';
import inquirer from 'inquirer';

export async function showSystemCleanMenu() {
  console.clear();
  console.log();
  console.log(chalk.blue('  🖥  System Cleanup'));
  console.log(chalk.dim('  ─────────────────────────────────────'));
  console.log();
  console.log(chalk.yellow('  🚧  Coming soon!'));
  console.log();
  console.log(
    chalk.gray('  This section will include system-level cleanup features\n') +
    chalk.gray('  like Trash, Downloads, old logs, and more.\n')
  );

  const { back } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'back',
      message: 'Go back to main menu?',
      default: true,
    },
  ]);

  if (back) {
    const { showMainMenu } = await import('../index.js');
  }
}
