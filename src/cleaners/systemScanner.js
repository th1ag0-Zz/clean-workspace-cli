import { lstat, readdir } from 'fs/promises';
import { basename, join } from 'path';
import os from 'os';

export const DEFAULT_MIN_AGE_DAYS = 30;

export function getSystemTargets(homeDir = os.homedir()) {
  const userCachesPath = join(homeDir, 'Library', 'Caches');

  return [
    {
      id: 'trash',
      label: 'Trash',
      description: 'Everything currently in the Trash',
      icon: '🗑️',
      path: join(homeDir, '.Trash'),
      minAgeDays: 0,
    },
    {
      id: 'downloads',
      label: 'Old Downloads',
      description: `Items untouched for ${DEFAULT_MIN_AGE_DAYS}+ days`,
      icon: '⬇️',
      path: join(homeDir, 'Downloads'),
      minAgeDays: DEFAULT_MIN_AGE_DAYS,
    },
    {
      id: 'logs',
      label: 'Old app logs',
      description: `Items in ~/Library/Logs untouched for ${DEFAULT_MIN_AGE_DAYS}+ days`,
      icon: '📜',
      path: join(homeDir, 'Library', 'Logs'),
      minAgeDays: DEFAULT_MIN_AGE_DAYS,
    },
    {
      id: 'app_caches',
      label: 'Other app caches',
      description: 'Per-user caches created by installed apps',
      icon: '🧩',
      path: userCachesPath,
      minAgeDays: 0,
      includeEntry: (entry) => !isAppleCache(entry.name),
    },
    {
      id: 'macos_caches',
      label: 'macOS caches',
      description: 'Per-user caches managed by macOS and Apple apps',
      icon: '🍎',
      path: userCachesPath,
      minAgeDays: 0,
      includeEntry: (entry) => isAppleCache(entry.name),
    },
  ];
}

/**
 * Scan macOS user-cleanup locations. Age is based on the newest entry inside
 * each top-level item, so a folder containing recent work is never selected.
 */
export async function scanSystemTargets({
  homeDir = os.homedir(),
  now = Date.now(),
} = {}) {
  const targets = getSystemTargets(homeDir);

  return Promise.all(
    targets.map(async (target) => ({
      ...target,
      items: await scanTarget(target, now),
    }))
  );
}

async function scanTarget(target, now) {
  let entries;

  try {
    entries = await readdir(target.path, { withFileTypes: true });
  } catch {
    return [];
  }

  if (target.includeEntry) {
    entries = entries.filter(target.includeEntry);
  }

  const cutoff = now - target.minAgeDays * 24 * 60 * 60 * 1000;
  const inspected = await Promise.all(
    entries.map((entry) => inspectPath(join(target.path, entry.name)))
  );

  return inspected
    .filter(Boolean)
    .filter((item) => target.minAgeDays === 0 || item.modifiedAt <= cutoff)
    .sort((a, b) => a.modifiedAt - b.modifiedAt);
}

function isAppleCache(name) {
  return name === 'Apple' || name.startsWith('com.apple.');
}

async function inspectPath(itemPath) {
  try {
    const stats = await lstat(itemPath);

    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      return {
        path: itemPath,
        name: basename(itemPath),
        size: stats.isFile() ? stats.size : 0,
        modifiedAt: stats.mtimeMs,
        type: stats.isDirectory() ? 'folder' : 'file',
      };
    }

    const entries = await readdir(itemPath, { withFileTypes: true });
    const children = await Promise.all(
      entries.map((entry) => inspectPath(join(itemPath, entry.name)))
    );

    if (children.some((child) => child === null)) return null;

    return {
      path: itemPath,
      name: basename(itemPath),
      size: children.reduce((total, child) => total + child.size, 0),
      modifiedAt: children.reduce(
        (latest, child) => Math.max(latest, child.modifiedAt),
        stats.mtimeMs
      ),
      type: 'folder',
    };
  } catch {
    // If an item cannot be fully inspected, omit it rather than risk deleting it.
    return null;
  }
}
