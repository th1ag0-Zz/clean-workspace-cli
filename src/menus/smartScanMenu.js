import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { loadConfiguration } from '../core/config.js';
import { smartScan } from '../core/scanner.js';
import { renderScanTable } from '../reporters/table.js';

export async function showSmartScanMenu() {
  console.clear();
  console.log(`\n  ${chalk.cyan('◉')} ${chalk.bold('Smart Scan')}  ${chalk.dim('workspace + developer caches + system')}\n`);
  const spinner = ora({ text: 'Analyzing all supported locations...', color: 'cyan' }).start();
  try {
    const workspaceRoot = process.cwd();
    const loaded = await loadConfiguration({ workspaceRoot });
    const results = await smartScan({
      mode: 'all',
      workspaceRoot,
      concurrency: loaded.config.concurrency,
      ignorePatterns: loaded.ignorePatterns,
      excludedPaths: loaded.excludedPaths,
    });
    spinner.succeed('Scan complete');
    console.log(`\n${renderScanTable(results, { mode: 'all', workspaceRoot }).trimEnd()}\n`);
  } catch (error) {
    spinner.fail('Scan failed');
    console.log(chalk.red(`\n  ${error.message}\n`));
  }
  await inquirer.prompt([{
    type: 'input', name: '_', message: chalk.dim('Press Enter to return to the dashboard...'),
  }]);
}
