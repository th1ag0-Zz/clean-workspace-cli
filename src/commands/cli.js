import { runCleanCommand } from './clean.js';
import { runConfigCommand } from './config.js';
import { runHistoryCommand } from './history.js';
import { runScanCommand } from './scan.js';

export async function runCli(args, options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const [command, ...commandArgs] = args;
  if (command === 'scan') return runScanCommand(commandArgs, { ...options, stdout, stderr });
  if (command === 'clean') return runCleanCommand(commandArgs, { ...options, stdout, stderr });
  if (command === 'config') return runConfigCommand(commandArgs, { ...options, stdout, stderr });
  if (command === 'history') return runHistoryCommand(commandArgs, { ...options, stdout, stderr });
  if (command === '--help' || command === '-h') {
    stdout.write(
      'Usage: cw [command]\n\nCommands:\n' +
      '  scan [path]     Analyze reclaimable development space\n' +
      '  clean [path]    Build or apply a controlled cleanup plan\n' +
      '  config          Show or initialize configuration\n' +
      '  history         Show cleanup receipts\n'
    );
    return 0;
  }
  stderr.write(`Error: Unknown command: ${command}\n`);
  return 2;
}
