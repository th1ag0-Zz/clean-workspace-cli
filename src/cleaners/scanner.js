import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { join } from 'node:path';
import { glob } from 'glob';
import { scanWorkspace } from '../core/scanner.js';

/** @deprecated Use scanWorkspace from core/scanner.js. */
export async function scanForTargets(patterns, cwd = process.cwd()) {
  const target = {
    id: 'legacy-workspace-scan',
    category: 'workspace',
    label: 'Workspace artifacts',
    description: 'Workspace artifacts',
    icon: '📁',
    patterns,
    risk: 'review',
  };
  const [result] = await scanWorkspace({ workspaceRoot: cwd, targets: [target] });
  return result.items;
}

export function getDirSize(dirPath) {
  try {
    const output = execFileSync('du', ['-sk', dirPath], {
      encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return Number.parseInt(output.split(/\s+/)[0], 10) * 1024;
  } catch {
    return 0;
  }
}

export const getNpmCachePath = () => commandPath('npm', ['config', 'get', 'cache'], join(os.homedir(), '.npm'));
export const getYarnCachePath = () => commandPath('yarn', ['cache', 'dir'], join(os.homedir(), 'Library', 'Caches', 'yarn'));
export const getPnpmStorePath = () => commandPath('pnpm', ['store', 'path'], join(os.homedir(), 'Library', 'pnpm', 'store'));
export const getBunCachePath = () => join(os.homedir(), 'Library', 'Caches', 'bun');
export const getGradleCachePath = () => join(os.homedir(), '.gradle', 'caches');
export const getCocoaPodsCachePath = () => join(os.homedir(), 'Library', 'Caches', 'CocoaPods');
export const getExpoCachePath = () => join(os.homedir(), '.expo');

export async function getMetroCachePaths(tempDir = os.tmpdir()) {
  return glob(['metro-*', 'haste-*'], { cwd: tempDir, absolute: true, dot: true, follow: false });
}

export function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
}

function commandPath(command, args, fallback) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}
