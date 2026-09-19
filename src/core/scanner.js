import { execFile } from 'node:child_process';
import { lstat, readdir, realpath } from 'node:fs/promises';
import os from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { glob } from 'glob';
import { ScanResult } from './models.js';
import { getGlobalTargets, getSystemTargets, LOCAL_TARGETS } from './targets.js';

const execFileAsync = promisify(execFile);
export const DEFAULT_SCAN_CONCURRENCY = 8;

export async function smartScan({
  mode = 'workspace',
  workspaceRoot = process.cwd(),
  homeDir = os.homedir(),
  tempDir = os.tmpdir(),
  categories,
  risks,
  concurrency = DEFAULT_SCAN_CONCURRENCY,
  ignorePatterns = [],
  excludedPaths = [],
  localTargets = LOCAL_TARGETS,
  globalTargets = getGlobalTargets(homeDir, tempDir),
  systemTargets = getSystemTargets(homeDir),
} = {}) {
  const limit = createConcurrencyLimiter(concurrency);
  const scans = [];

  if (mode === 'workspace' || mode === 'all') {
    scans.push(scanWorkspace({
      workspaceRoot,
      targets: filterTargets(localTargets, categories, risks),
      ignorePatterns,
      limit,
    }));
  }
  if (mode === 'all') {
    scans.push(scanGlobalCaches({
      homeDir,
      tempDir,
      targets: filterTargets(globalTargets, categories, risks),
      limit,
    }));
  }
  if (mode === 'system' || mode === 'all') {
    scans.push(scanSystem({
      homeDir,
      targets: filterTargets(systemTargets, categories, risks),
      limit,
    }));
  }

  if (scans.length === 0) throw new TypeError(`Unsupported scan mode: ${mode}`);
  return dedupeScanResults(filterExcludedResults((await Promise.all(scans)).flat(), excludedPaths));
}

export async function scanWorkspace({
  workspaceRoot = process.cwd(),
  targets = LOCAL_TARGETS,
  ignorePatterns = [],
  concurrency = DEFAULT_SCAN_CONCURRENCY,
  limit = createConcurrencyLimiter(concurrency),
} = {}) {
  const root = resolve(workspaceRoot);
  return Promise.all(targets.map(async (target) => {
    const matches = await Promise.all(target.patterns.map(async (pattern) => {
      const found = await glob(pattern, {
        cwd: root,
        absolute: true,
        dot: true,
        follow: false,
        ignore: [
          '**/node_modules/**/node_modules/**',
          '**/.git/**',
          ...expandIgnorePatterns(ignorePatterns),
        ],
      });
      const inspected = await Promise.all(found.map((itemPath) => inspectItem(itemPath, { limit })));
      return inspected.filter(Boolean).map((item) => ({
        ...item,
        relativePath: displayRelative(root, item.path),
        pattern,
      }));
    }));
    return new ScanResult({ target, scopeRoot: root, items: dedupeItems(matches.flat()) });
  }));
}

export async function scanGlobalCaches({
  homeDir = os.homedir(),
  tempDir = os.tmpdir(),
  targets = getGlobalTargets(homeDir, tempDir),
  concurrency = DEFAULT_SCAN_CONCURRENCY,
  limit = createConcurrencyLimiter(concurrency),
} = {}) {
  return Promise.all(targets.map(async (target) => {
    const paths = await resolveGlobalPaths(target.pathSpec);
    const inspected = await Promise.all(paths.map((itemPath) => inspectItem(itemPath, { limit })));
    const items = inspected.filter(Boolean).map((item) => ({
      ...item,
      relativePath: item.path,
      pattern: target.id,
    }));
    const scopeRoot = target.pathSpec.root
      ? resolve(target.pathSpec.root)
      : dirname(resolve(paths[0] ?? target.pathSpec.path ?? target.pathSpec.fallback));
    return new ScanResult({ target, scopeRoot, items: dedupeItems(items) });
  }));
}

export async function scanSystem({
  homeDir = os.homedir(),
  now = Date.now(),
  targets = getSystemTargets(homeDir),
  concurrency = DEFAULT_SCAN_CONCURRENCY,
  limit = createConcurrencyLimiter(concurrency),
} = {}) {
  return Promise.all(targets.map(async (target) => {
    let entries;
    try {
      entries = await limit(() => readdir(target.path, { withFileTypes: true }));
    } catch {
      return new ScanResult({ target, scopeRoot: target.path, items: [] });
    }

    if (target.includeName) entries = entries.filter((entry) => target.includeName(entry.name));
    const cutoff = now - target.minAgeDays * 24 * 60 * 60 * 1000;
    const inspected = await Promise.all(
      entries.map((entry) => inspectSystemItem(join(target.path, entry.name), limit))
    );
    const items = inspected
      .filter(Boolean)
      .filter((item) => target.minAgeDays === 0 || item.modifiedAt <= cutoff)
      .sort((a, b) => a.modifiedAt - b.modifiedAt);
    return new ScanResult({ target, scopeRoot: target.path, items });
  }));
}

export async function inspectItem(
  itemPath,
  { limit = createConcurrencyLimiter(DEFAULT_SCAN_CONCURRENCY) } = {}
) {
  try {
    const stats = await limit(() => lstat(itemPath));
    const type = fileType(stats);
    if (type === 'other') return null;

    return {
      path: resolve(itemPath),
      realPath: await limit(() => realpath(itemPath)),
      name: basename(itemPath),
      size: type === 'directory' ? await directorySize(itemPath, limit) : stats.size,
      modifiedAt: stats.mtimeMs,
      type,
      fingerprint: fingerprint(stats, type),
    };
  } catch {
    return null;
  }
}

export function createConcurrencyLimiter(concurrency = DEFAULT_SCAN_CONCURRENCY) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError('Scan concurrency must be a positive integer.');
  }

  let active = 0;
  const queue = [];
  const runNext = () => {
    while (active < concurrency && queue.length > 0) {
      const { task, resolveTask, rejectTask } = queue.shift();
      active++;
      Promise.resolve()
        .then(task)
        .then(resolveTask, rejectTask)
        .finally(() => {
          active--;
          runNext();
        });
    }
  };

  return (task) => new Promise((resolveTask, rejectTask) => {
    queue.push({ task, resolveTask, rejectTask });
    runNext();
  });
}

async function inspectSystemItem(itemPath, limit) {
  try {
    const stats = await limit(() => lstat(itemPath));
    const type = fileType(stats);
    if (type === 'other' || type === 'symlink' || type === 'file') {
      return inspectItem(itemPath, { limit });
    }

    const entries = await limit(() => readdir(itemPath, { withFileTypes: true }));
    const children = await Promise.all(
      entries.map((entry) => inspectSystemItem(join(itemPath, entry.name), limit))
    );
    if (children.some((child) => child === null)) return null;

    return {
      path: resolve(itemPath),
      realPath: await limit(() => realpath(itemPath)),
      name: basename(itemPath),
      size: children.reduce((total, child) => total + child.size, 0),
      modifiedAt: children.reduce(
        (latest, child) => Math.max(latest, child.modifiedAt),
        stats.mtimeMs
      ),
      type,
      fingerprint: fingerprint(stats, type),
    };
  } catch {
    return null;
  }
}

async function directorySize(dirPath, limit) {
  const entries = await limit(() => readdir(dirPath, { withFileTypes: true }));
  const sizes = await Promise.all(entries.map(async (entry) => {
    const childPath = join(dirPath, entry.name);
    const stats = await limit(() => lstat(childPath));
    if (stats.isSymbolicLink()) return 0;
    if (stats.isDirectory()) return directorySize(childPath, limit);
    return stats.isFile() ? stats.size : 0;
  }));
  return sizes.reduce((total, size) => total + size, 0);
}

async function resolveGlobalPaths(spec) {
  if (spec.patterns) {
    const matches = await Promise.all(spec.patterns.map((pattern) => glob(pattern, {
      cwd: spec.root,
      absolute: true,
      dot: true,
      follow: false,
    })));
    return matches.flat();
  }
  if (spec.path) return [spec.path];

  try {
    const { stdout } = await execFileAsync(spec.command, spec.args, {
      encoding: 'utf8',
      timeout: 10_000,
    });
    return [stdout.trim() || spec.fallback];
  } catch {
    return [spec.fallback];
  }
}

function filterTargets(targets, categories, risks) {
  const categorySet = categories?.length ? new Set(categories) : null;
  const riskSet = risks?.length ? new Set(risks) : null;
  return targets.filter((target) =>
    (!categorySet || categorySet.has(target.category)) &&
    (!riskSet || riskSet.has(target.risk))
  );
}

function fingerprint(stats, type) {
  return Object.freeze({
    device: stats.dev,
    inode: stats.ino,
    mode: stats.mode,
    size: stats.size,
    modifiedAt: stats.mtimeMs,
    type,
  });
}

function fileType(stats) {
  if (stats.isSymbolicLink()) return 'symlink';
  if (stats.isDirectory()) return 'directory';
  if (stats.isFile()) return 'file';
  return 'other';
}

function displayRelative(root, itemPath) {
  const value = relative(root, itemPath);
  return value ? `./${value}` : '.';
}

function dedupeItems(items) {
  return [...new Map(items.map((item) => [item.path, item])).values()];
}

function expandIgnorePatterns(patterns) {
  return patterns.flatMap((pattern) => {
    const normalized = pattern.replace(/^\.\//, '').replace(/\/$/, '');
    return normalized.endsWith('/**') ? [normalized] : [normalized, `${normalized}/**`];
  });
}

function filterExcludedResults(results, excludedPaths) {
  if (excludedPaths.length === 0) return results;
  const roots = excludedPaths.map((path) => resolve(path));
  return results.map((result) => new ScanResult({
    target: result.target,
    scopeRoot: result.scopeRoot,
    scannedAt: result.scannedAt,
    items: result.items.filter((item) => !roots.some((root) => isSameOrInside(root, item.path))),
  }));
}

function isSameOrInside(root, candidate) {
  const child = relative(root, resolve(candidate));
  return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

function dedupeScanResults(results) {
  const winners = new Map();
  results.forEach((result, resultIndex) => {
    result.items.forEach((item) => {
      const candidate = {
        resultIndex,
        risk: riskPriority(result.target.risk),
        specificity: item.pattern?.length ?? 0,
      };
      const current = winners.get(item.path);
      if (!current || candidate.risk > current.risk ||
          (candidate.risk === current.risk && candidate.specificity > current.specificity)) {
        winners.set(item.path, candidate);
      }
    });
  });

  return results.map((result, resultIndex) => new ScanResult({
    target: result.target,
    scopeRoot: result.scopeRoot,
    scannedAt: result.scannedAt,
    items: result.items.filter((item) => winners.get(item.path)?.resultIndex === resultIndex),
  }));
}

function riskPriority(risk) {
  return risk === 'sensitive' ? 3 : risk === 'review' ? 2 : 1;
}
