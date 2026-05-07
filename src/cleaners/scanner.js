import { execSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { glob } from 'glob';
import os from 'os';

/**
 * Get size of a directory in bytes using du (macOS compatible)
 */
export function getDirSize(dirPath) {
  try {
    const result = execSync(`du -sk "${dirPath}" 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    const kb = parseInt(result.split('\t')[0], 10);
    return kb * 1024;
  } catch {
    return 0;
  }
}

/**
 * Scan current working directory for specific folder patterns
 */
export async function scanForTargets(patterns, cwd = process.cwd()) {
  const results = [];

  for (const pattern of patterns) {
    const found = await glob(pattern, {
      cwd,
      absolute: true,
      ignore: ['**/node_modules/**/node_modules/**', '**/.git/**'],
      dot: true,
    });

    for (const dirPath of found) {
      if (existsSync(dirPath)) {
        const size = getDirSize(dirPath);
        results.push({
          path: dirPath,
          relativePath: dirPath.replace(cwd + '/', './'),
          size,
          pattern,
        });
      }
    }
  }

  return results;
}

/**
 * Get npm global cache path
 */
export function getNpmCachePath() {
  try {
    const path = execSync('npm config get cache', { encoding: 'utf8' }).trim();
    return path;
  } catch {
    return join(os.homedir(), '.npm');
  }
}

/**
 * Get yarn global cache path
 */
export function getYarnCachePath() {
  try {
    const path = execSync('yarn cache dir 2>/dev/null', { encoding: 'utf8' }).trim();
    return path;
  } catch {
    return join(os.homedir(), 'Library/Caches/yarn');
  }
}

/**
 * Get pnpm store path
 */
export function getPnpmStorePath() {
  try {
    const path = execSync('pnpm store path 2>/dev/null', { encoding: 'utf8' }).trim();
    return path;
  } catch {
    return join(os.homedir(), 'Library/pnpm/store');
  }
}

/**
 * Get Bun cache path
 */
export function getBunCachePath() {
  return join(os.homedir(), 'Library/Caches/bun');
}

/**
 * Get Gradle cache path
 */
export function getGradleCachePath() {
  return join(os.homedir(), '.gradle/caches');
}

/**
 * Get CocoaPods cache path
 */
export function getCocoaPodsCachePath() {
  return join(os.homedir(), 'Library/Caches/CocoaPods');
}

/**
 * Get Expo cache path
 */
export function getExpoCachePath() {
  return join(os.homedir(), '.expo');
}

/**
 * Get Metro bundler cache
 */
export function getMetroCachePath() {
  return join(os.tmpdir(), 'metro-*');
}

export function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
