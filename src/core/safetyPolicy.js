import { lstat, realpath } from 'node:fs/promises';
import os from 'node:os';
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';

export class SafetyPolicyError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SafetyPolicyError';
    this.code = code;
  }
}

export class SafetyPolicy {
  constructor({ homeDir = os.homedir(), workspaceRoot = process.cwd() } = {}) {
    this.protectedPaths = new Set([
      parse(resolve(workspaceRoot)).root,
      resolve(homeDir),
      resolve(workspaceRoot),
    ]);
  }

  async validate(entry) {
    if (!entry?.path || !Array.isArray(entry.allowedRoots) || !entry.fingerprint) {
      throw new SafetyPolicyError('The plan entry is incomplete.', 'INVALID_ENTRY');
    }
    if (!isAbsolute(entry.path)) {
      throw new SafetyPolicyError('Cleanup paths must be absolute.', 'RELATIVE_PATH');
    }

    const candidate = resolve(entry.path);
    if (this.protectedPaths.has(candidate)) {
      throw new SafetyPolicyError(`Protected path cannot be deleted: ${candidate}`, 'PROTECTED_PATH');
    }
    if (candidate.split(sep).includes('.git')) {
      throw new SafetyPolicyError(`Git metadata cannot be deleted: ${candidate}`, 'PROTECTED_PATH');
    }

    const allowedRoot = entry.allowedRoots
      .map((root) => resolve(root))
      .find((root) => isInside(root, candidate));
    if (!allowedRoot || allowedRoot === parse(allowedRoot).root) {
      throw new SafetyPolicyError(`Path is outside its allowed scope: ${candidate}`, 'OUTSIDE_SCOPE');
    }

    let stats;
    try {
      stats = await lstat(candidate);
    } catch {
      throw new SafetyPolicyError(`Planned path no longer exists: ${candidate}`, 'MISSING_PATH');
    }
    if (stats.isSymbolicLink()) {
      throw new SafetyPolicyError(`Symbolic links cannot be cleanup targets: ${candidate}`, 'SYMLINK');
    }

    await assertNoSymlinkTraversal(allowedRoot, candidate);

    const [realRoot, realCandidate] = await Promise.all([
      realpath(allowedRoot),
      realpath(candidate),
    ]);
    if (!isInside(realRoot, realCandidate)) {
      throw new SafetyPolicyError(`Resolved path is outside its allowed scope: ${candidate}`, 'OUTSIDE_SCOPE');
    }

    const actualType = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';
    if (actualType !== entry.fingerprint.type || !sameFingerprint(stats, entry.fingerprint)) {
      throw new SafetyPolicyError(`Planned item changed after scanning: ${candidate}`, 'ITEM_CHANGED');
    }

    return { path: candidate, type: actualType };
  }
}

function isInside(root, candidate) {
  const child = relative(root, candidate);
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

async function assertNoSymlinkTraversal(root, candidate) {
  const child = relative(root, candidate);
  let current = root;

  for (const segment of child.split(sep)) {
    current = resolve(current, segment);
    const stats = await lstat(current);
    if (stats.isSymbolicLink()) {
      throw new SafetyPolicyError(`Path traverses a symbolic link: ${current}`, 'SYMLINK');
    }
  }
}

function sameFingerprint(stats, expected) {
  return stats.dev === expected.device &&
    stats.ino === expected.inode &&
    stats.mode === expected.mode &&
    stats.size === expected.size &&
    stats.mtimeMs === expected.modifiedAt;
}
