import { execSync, exec } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Delete a directory recursively
 */
export function deleteDir(dirPath) {
  if (!existsSync(dirPath)) return { success: true, skipped: true };
  try {
    rmSync(dirPath, { recursive: true, force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Clear npm global cache
 */
export async function clearNpmCache() {
  try {
    await execAsync('npm cache clean --force');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Clear yarn global cache
 */
export async function clearYarnCache() {
  try {
    await execAsync('yarn cache clean');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Clear pnpm store
 */
export async function clearPnpmCache() {
  try {
    await execAsync('pnpm store prune');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Clear Bun cache
 */
export async function clearBunCache() {
  try {
    await execAsync('bun pm cache rm');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Clear CocoaPods cache
 */
export async function clearCocoaPodsCache() {
  try {
    await execAsync('pod cache clean --all');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Clear Expo cache
 */
export async function clearExpoCache() {
  try {
    await execAsync('expo r -c --non-interactive 2>/dev/null || true');
    const { deleteDir: del } = await import('./cleaner.js');
    const os = await import('os');
    const path = await import('path');
    del(path.join(os.default.homedir(), '.expo'));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Clear Metro bundler cache
 */
export async function clearMetroCache() {
  try {
    await execAsync('rm -rf /tmp/metro-* 2>/dev/null || true');
    await execAsync('rm -rf /tmp/haste-* 2>/dev/null || true');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Clear Gradle caches
 */
export async function clearGradleCache() {
  try {
    const os = await import('os');
    const path = await import('path');
    const gradleCaches = path.join(os.default.homedir(), '.gradle/caches');
    rmSync(gradleCaches, { recursive: true, force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
