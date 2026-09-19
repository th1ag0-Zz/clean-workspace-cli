import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { DEFAULT_SCAN_CONCURRENCY } from './scanner.js';

export const DEFAULT_CONFIG = Object.freeze({
  ignore: Object.freeze([]),
  concurrency: DEFAULT_SCAN_CONCURRENCY,
  defaultPreset: 'safe',
  sensitivePolicy: 'confirm',
});

export class ConfigError extends Error {}

export function getConfigPath(homeDir = os.homedir()) {
  return join(homeDir, '.config', 'devclean', 'config.json');
}

export async function loadConfiguration({
  homeDir = os.homedir(),
  workspaceRoot,
  configPath = getConfigPath(homeDir),
} = {}) {
  const fileConfig = await readJsonIfExists(configPath);
  const config = validateConfig({ ...DEFAULT_CONFIG, ...fileConfig });
  const workspaceIgnorePath = workspaceRoot ? join(workspaceRoot, '.devcleanignore') : null;
  const workspaceIgnore = workspaceIgnorePath ? await readIgnoreFile(workspaceIgnorePath) : [];
  const configuredIgnore = config.ignore.filter((entry) => !isAbsolute(entry));
  const excludedPaths = config.ignore
    .filter(isAbsolute)
    .map((entry) => resolve(entry));

  return Object.freeze({
    config,
    configPath,
    workspaceIgnorePath,
    ignorePatterns: Object.freeze([...configuredIgnore, ...workspaceIgnore]),
    excludedPaths: Object.freeze(excludedPaths),
  });
}

export async function initializeConfig({
  homeDir = os.homedir(),
  configPath = getConfigPath(homeDir),
  force = false,
} = {}) {
  await mkdir(dirname(configPath), { recursive: true });
  const content = `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`;
  try {
    await writeFile(configPath, content, { encoding: 'utf8', flag: force ? 'w' : 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new ConfigError(`Configuration already exists: ${configPath}`);
    }
    throw error;
  }
  return configPath;
}

function validateConfig(config) {
  if (!Array.isArray(config.ignore) || !config.ignore.every((entry) => typeof entry === 'string')) {
    throw new ConfigError('Configuration field "ignore" must be an array of paths or patterns.');
  }
  if (!Number.isInteger(config.concurrency) || config.concurrency < 1 || config.concurrency > 64) {
    throw new ConfigError('Configuration field "concurrency" must be an integer from 1 to 64.');
  }
  if (!['safe', 'deep'].includes(config.defaultPreset)) {
    throw new ConfigError('Configuration field "defaultPreset" must be "safe" or "deep".');
  }
  if (!['confirm', 'deny'].includes(config.sensitivePolicy)) {
    throw new ConfigError('Configuration field "sensitivePolicy" must be "confirm" or "deny".');
  }
  return Object.freeze({
    ignore: Object.freeze([...config.ignore]),
    concurrency: config.concurrency,
    defaultPreset: config.defaultPreset,
    sensitivePolicy: config.sensitivePolicy,
  });
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    if (error instanceof SyntaxError) throw new ConfigError(`Invalid JSON in configuration: ${path}`);
    throw error;
  }
}

async function readIgnoreFile(path) {
  try {
    return (await readFile(path, 'utf8'))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
