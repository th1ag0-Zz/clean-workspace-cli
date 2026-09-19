import os from 'node:os';
import { join } from 'node:path';

export const LOCAL_TARGETS = Object.freeze([
  localTarget('node_modules', 'node_modules', 'Node.js dependency folders', '📦', ['**/node_modules'], 'review'),
  localTarget('next', '.next', 'Next.js build cache', '▲', ['**/.next']),
  localTarget('dist', 'dist / build / out', 'Build output folders', '📁', ['**/dist', '**/build', '**/out']),
  localTarget('turbo', '.turbo', 'Turborepo local cache', '⚡', ['**/.turbo']),
  localTarget('parcel', '.parcel-cache', 'Parcel bundler cache', '📦', ['**/.parcel-cache']),
  localTarget('vite', '.vite', 'Vite build cache', '⚡', ['**/.vite']),
  localTarget('swc', '.swc', 'SWC compiler cache', '🦀', ['**/.swc']),
  localTarget('expo_local', '.expo (local)', 'Expo local project cache', '📱', ['**/.expo']),
  localTarget('android', 'android/build', 'Android build artifacts', '🤖', ['**/android/build', '**/android/.gradle']),
  localTarget('ios_derived', 'ios/build', 'iOS build artifacts (local)', '🍎', ['**/ios/build', '**/ios/Pods'], 'review'),
  localTarget('coverage', 'coverage', 'Test coverage reports', '🧪', ['**/coverage']),
  localTarget('storybook', '.storybook-cache / storybook-static', 'Storybook build & cache', '📖', ['**/.storybook-cache', '**/storybook-static']),
]);

export function getGlobalTargets(homeDir = os.homedir(), tempDir = os.tmpdir()) {
  return [
    globalTarget('npm_cache', 'npm cache (global)', 'npm global package cache', '🌐', {
      command: 'npm', args: ['config', 'get', 'cache'], fallback: join(homeDir, '.npm'),
    }),
    globalTarget('yarn_cache', 'Yarn cache (global)', 'Yarn global package cache', '🧶', {
      command: 'yarn', args: ['cache', 'dir'], fallback: join(homeDir, 'Library', 'Caches', 'yarn'),
    }),
    globalTarget('pnpm_store', 'pnpm store (global)', 'pnpm content-addressable store', '⚡', {
      command: 'pnpm', args: ['store', 'path'], fallback: join(homeDir, 'Library', 'pnpm', 'store'),
    }),
    globalTarget('bun_cache', 'Bun cache (global)', 'Bun package cache', '🥟', {
      path: join(homeDir, 'Library', 'Caches', 'bun'),
    }),
    globalTarget('gradle_cache', 'Gradle cache (global)', '~/.gradle/caches — Android builds', '🤖', {
      path: join(homeDir, '.gradle', 'caches'),
    }),
    globalTarget('cocoapods_cache', 'CocoaPods cache (global)', 'iOS pod cache', '🍎', {
      path: join(homeDir, 'Library', 'Caches', 'CocoaPods'),
    }),
    globalTarget('metro_cache', 'Metro cache (global)', 'React Native bundler temporary cache', '📱', {
      root: tempDir, patterns: ['metro-*', 'haste-*'],
    }),
  ];
}

export const DEFAULT_MIN_AGE_DAYS = 30;

export function getSystemTargets(homeDir = os.homedir()) {
  const userCachesPath = join(homeDir, 'Library', 'Caches');

  return [
    systemTarget('trash', 'Trash', 'Everything currently in the Trash', '🗑️', join(homeDir, '.Trash')),
    systemTarget('downloads', 'Old Downloads', `Items untouched for ${DEFAULT_MIN_AGE_DAYS}+ days`, '⬇️', join(homeDir, 'Downloads'), DEFAULT_MIN_AGE_DAYS),
    systemTarget('logs', 'Old app logs', `Items in ~/Library/Logs untouched for ${DEFAULT_MIN_AGE_DAYS}+ days`, '📜', join(homeDir, 'Library', 'Logs'), DEFAULT_MIN_AGE_DAYS),
    systemTarget('app_caches', 'Other app caches', 'Per-user caches created by installed apps', '🧩', userCachesPath, 0, (name) => !isAppleCache(name)),
    systemTarget('macos_caches', 'macOS caches', 'Per-user caches managed by macOS and Apple apps', '🍎', userCachesPath, 0, isAppleCache),
  ];
}

function localTarget(id, label, description, icon, patterns, risk = 'safe') {
  return Object.freeze({ id, category: 'workspace', label, description, icon, patterns: Object.freeze(patterns), risk });
}

function globalTarget(id, label, description, icon, pathSpec) {
  return Object.freeze({ id, category: 'global-cache', label, description, icon, pathSpec, risk: 'review' });
}

function systemTarget(id, label, description, icon, path, minAgeDays = 0, includeName) {
  return Object.freeze({ id, category: 'system', label, description, icon, path, minAgeDays, includeName, risk: 'sensitive' });
}

function isAppleCache(name) {
  return name === 'Apple' || name.startsWith('com.apple.');
}
