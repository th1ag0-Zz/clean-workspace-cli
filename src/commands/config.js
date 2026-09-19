import os from 'node:os';
import { resolve } from 'node:path';
import { initializeConfig, loadConfiguration } from '../core/config.js';

export async function runConfigCommand(args, {
  cwd = process.cwd(),
  homeDir = os.homedir(),
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const [action, ...flags] = args;
  const json = flags.includes('--json');
  const unknown = flags.find((flag) => !['--json', '--force'].includes(flag));
  if (!['show', 'init'].includes(action) || unknown || (action === 'show' && flags.includes('--force'))) {
    stderr.write('Usage: cw config show [--json] | cw config init [--force] [--json]\n');
    return 2;
  }

  try {
    if (action === 'init') {
      const path = await initializeConfig({ homeDir, force: flags.includes('--force') });
      stdout.write(json ? `${JSON.stringify({ path, created: true })}\n` : `Configuration created: ${path}\n`);
      return 0;
    }

    const loaded = await loadConfiguration({ homeDir, workspaceRoot: resolve(cwd) });
    const document = {
      ...loaded.config,
      configPath: loaded.configPath,
      workspaceIgnorePath: loaded.workspaceIgnorePath,
      effectiveIgnorePatterns: loaded.ignorePatterns,
      excludedPaths: loaded.excludedPaths,
    };
    stdout.write(json ? `${JSON.stringify(document, null, 2)}\n` : `${formatConfig(document)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`Error: ${error.message}\n`);
    return 1;
  }
}

function formatConfig(config) {
  return [
    `Configuration: ${config.configPath}`,
    `Default preset: ${config.defaultPreset}`,
    `Concurrency: ${config.concurrency}`,
    `Sensitive policy: ${config.sensitivePolicy}`,
    `Ignored patterns: ${config.effectiveIgnorePatterns.join(', ') || 'none'}`,
    `Excluded paths: ${config.excludedPaths.join(', ') || 'none'}`,
  ].join('\n');
}
