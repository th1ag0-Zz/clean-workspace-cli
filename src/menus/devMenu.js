import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import {
  scanForTargets,
  getNpmCachePath,
  getYarnCachePath,
  getPnpmStorePath,
  getBunCachePath,
  getGradleCachePath,
  getCocoaPodsCachePath,
  getExpoCachePath,
  formatSize,
  getDirSize,
} from '../cleaners/scanner.js';
import {
  deleteDir,
  clearNpmCache,
  clearYarnCache,
  clearPnpmCache,
  clearBunCache,
  clearCocoaPodsCache,
  clearMetroCache,
  clearGradleCache,
} from '../cleaners/cleaner.js';
import { existsSync } from 'fs';

// ─── Target definitions ────────────────────────────────────────────────────

const LOCAL_SCAN_TARGETS = [
  {
    id: 'node_modules',
    label: 'node_modules',
    description: 'Node.js dependency folders',
    icon: '📦',
    patterns: ['**/node_modules'],
    isGlobal: false,
  },
  {
    id: 'next',
    label: '.next',
    description: 'Next.js build cache',
    icon: '▲',
    patterns: ['**/.next'],
    isGlobal: false,
  },
  {
    id: 'dist',
    label: 'dist / build / out',
    description: 'Build output folders',
    icon: '📁',
    patterns: ['**/dist', '**/build', '**/out'],
    isGlobal: false,
  },
  {
    id: 'turbo',
    label: '.turbo',
    description: 'Turborepo local cache',
    icon: '⚡',
    patterns: ['**/.turbo'],
    isGlobal: false,
  },
  {
    id: 'parcel',
    label: '.parcel-cache',
    description: 'Parcel bundler cache',
    icon: '📦',
    patterns: ['**/.parcel-cache'],
    isGlobal: false,
  },
  {
    id: 'vite',
    label: '.vite',
    description: 'Vite build cache',
    icon: '⚡',
    patterns: ['**/.vite'],
    isGlobal: false,
  },
  {
    id: 'swc',
    label: '.swc',
    description: 'SWC compiler cache',
    icon: '🦀',
    patterns: ['**/.swc'],
    isGlobal: false,
  },
  {
    id: 'expo_local',
    label: '.expo (local)',
    description: 'Expo local project cache',
    icon: '📱',
    patterns: ['**/.expo'],
    isGlobal: false,
  },
  {
    id: 'android',
    label: 'android/build',
    description: 'Android build artifacts',
    icon: '🤖',
    patterns: ['**/android/build', '**/android/.gradle'],
    isGlobal: false,
  },
  {
    id: 'ios_derived',
    label: 'ios/build',
    description: 'iOS build artifacts (local)',
    icon: '🍎',
    patterns: ['**/ios/build', '**/ios/Pods'],
    isGlobal: false,
  },
  {
    id: 'coverage',
    label: 'coverage',
    description: 'Test coverage reports',
    icon: '🧪',
    patterns: ['**/coverage'],
    isGlobal: false,
  },
  {
    id: 'storybook',
    label: '.storybook-cache / storybook-static',
    description: 'Storybook build & cache',
    icon: '📖',
    patterns: ['**/.storybook-cache', '**/storybook-static'],
    isGlobal: false,
  },
];

const GLOBAL_TARGETS = [
  {
    id: 'npm_cache',
    label: 'npm cache (global)',
    description: 'npm global package cache',
    icon: '🌐',
    isGlobal: true,
    getPath: getNpmCachePath,
    clearFn: clearNpmCache,
  },
  {
    id: 'yarn_cache',
    label: 'Yarn cache (global)',
    description: 'Yarn global package cache',
    icon: '🧶',
    isGlobal: true,
    getPath: getYarnCachePath,
    clearFn: clearYarnCache,
  },
  {
    id: 'pnpm_store',
    label: 'pnpm store (global)',
    description: 'pnpm content-addressable store',
    icon: '⚡',
    isGlobal: true,
    getPath: getPnpmStorePath,
    clearFn: clearPnpmCache,
  },
  {
    id: 'bun_cache',
    label: 'Bun cache (global)',
    description: 'Bun package cache',
    icon: '🥟',
    isGlobal: true,
    getPath: getBunCachePath,
    clearFn: clearBunCache,
  },
  {
    id: 'gradle_cache',
    label: 'Gradle cache (global)',
    description: '~/.gradle/caches — Android builds',
    icon: '🤖',
    isGlobal: true,
    getPath: getGradleCachePath,
    clearFn: clearGradleCache,
  },
  {
    id: 'cocoapods_cache',
    label: 'CocoaPods cache (global)',
    description: 'iOS pod cache',
    icon: '🍎',
    isGlobal: true,
    getPath: getCocoaPodsCachePath,
    clearFn: clearCocoaPodsCache,
  },
  {
    id: 'metro_cache',
    label: 'Metro cache (global)',
    description: 'React Native bundler /tmp cache',
    icon: '📱',
    isGlobal: true,
    getPath: () => '/tmp/metro-*',
    clearFn: clearMetroCache,
  },
];

// ─── Main menu ─────────────────────────────────────────────────────────────

export async function showDevCleanMenu() {
  console.clear();
  printDevHeader();

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.bold('Choose an action:'),
      choices: [
        {
          name: `${chalk.yellow('🔍')} Scan current folder  ${chalk.dim('(see what can be cleaned)')}`,
          value: 'scan',
        },
        {
          name: `${chalk.red('🧹')} Quick clean          ${chalk.dim('(pick targets and delete)')}`,
          value: 'clean',
        },
        {
          name: `${chalk.blue('🌐')} Global caches        ${chalk.dim('(npm, yarn, pnpm, bun...)')}`,
          value: 'global',
        },
        new inquirer.Separator(chalk.dim('─────────────────────────────────────')),
        { name: chalk.dim('← Back to main menu'), value: 'back' },
      ],
    },
  ]);

  if (action === 'scan') await runScan();
  else if (action === 'clean') await runClean();
  else if (action === 'global') await runGlobalClean();
  else return;
}

// ─── Scan ──────────────────────────────────────────────────────────────────

async function runScan() {
  console.log();
  const spinner = ora({
    text: chalk.dim(`Scanning ${process.cwd()} ...`),
    color: 'cyan',
  }).start();

  const allPatterns = LOCAL_SCAN_TARGETS.flatMap((t) => t.patterns);
  const found = await scanForTargets(allPatterns);

  spinner.stop();

  if (found.length === 0) {
    console.log(chalk.green('\n  ✓ Nothing to clean here. Your project is spotless!\n'));
    await promptContinue();
    return showDevCleanMenu();
  }

  // Group by target type
  const grouped = {};
  for (const item of found) {
    const target = LOCAL_SCAN_TARGETS.find((t) => t.patterns.includes(item.pattern));
    const key = target?.id || item.pattern;
    if (!grouped[key]) grouped[key] = { target, items: [] };
    grouped[key].items.push(item);
  }

  console.log();
  console.log(chalk.bold(`  Found ${found.length} item(s) in ${chalk.cyan(process.cwd())}\n`));

  let totalSize = 0;

  for (const { target, items } of Object.values(grouped)) {
    const groupSize = items.reduce((acc, i) => acc + i.size, 0);
    totalSize += groupSize;
    console.log(
      `  ${target?.icon || '📁'} ${chalk.bold(target?.label || items[0].pattern)}` +
      chalk.dim(` — ${items.length} found — `) +
      chalk.yellow(formatSize(groupSize))
    );
    for (const item of items.slice(0, 3)) {
      console.log(`     ${chalk.dim(item.relativePath)}`);
    }
    if (items.length > 3) {
      console.log(`     ${chalk.dim(`... and ${items.length - 3} more`)}`);
    }
    console.log();
  }

  console.log(
    `  ${chalk.bold('Total reclaimable:')} ${chalk.green.bold(formatSize(totalSize))}\n`
  );

  await promptContinue();
  return showDevCleanMenu();
}

// ─── Clean (local) ─────────────────────────────────────────────────────────

async function runClean() {
  console.log();
  const spinner = ora({ text: chalk.dim('Scanning...'), color: 'cyan' }).start();

  const allPatterns = LOCAL_SCAN_TARGETS.flatMap((t) => t.patterns);
  const found = await scanForTargets(allPatterns);

  spinner.stop();

  if (found.length === 0) {
    console.log(chalk.green('\n  ✓ Nothing found to clean!\n'));
    await promptContinue();
    return showDevCleanMenu();
  }

  // Group found items by target
  const groupedChoices = [];

  for (const target of LOCAL_SCAN_TARGETS) {
    const matchingItems = found.filter((f) => target.patterns.includes(f.pattern));
    if (matchingItems.length === 0) continue;

    const groupSize = matchingItems.reduce((acc, i) => acc + i.size, 0);
    groupedChoices.push({
      name:
        `${target.icon} ${chalk.bold(target.label)}` +
        chalk.dim(` (${matchingItems.length} found) `) +
        chalk.yellow(formatSize(groupSize)),
      value: { target, items: matchingItems },
      checked: false,
    });
  }

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: chalk.bold('Select what to delete:'),
      choices: groupedChoices,
      pageSize: 15,
    },
  ]);

  if (selected.length === 0) {
    console.log(chalk.dim('\n  Nothing selected. Cancelled.\n'));
    await promptContinue();
    return showDevCleanMenu();
  }

  const totalSize = selected.reduce(
    (acc, s) => acc + s.items.reduce((a, i) => a + i.size, 0),
    0
  );

  console.log();
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message:
        chalk.red.bold(`Delete ${selected.reduce((a, s) => a + s.items.length, 0)} folders`) +
        chalk.dim(` (${formatSize(totalSize)})?`),
      default: false,
    },
  ]);

  if (!confirmed) {
    console.log(chalk.dim('\n  Cancelled.\n'));
    await promptContinue();
    return showDevCleanMenu();
  }

  console.log();
  let deleted = 0;
  let freed = 0;

  for (const { target, items } of selected) {
    const spinner = ora({ text: `Cleaning ${target.label}...`, color: 'cyan' }).start();
    let ok = 0;
    let fail = 0;

    for (const item of items) {
      const result = deleteDir(item.path);
      if (result.success && !result.skipped) {
        freed += item.size;
        ok++;
      } else if (!result.success) {
        fail++;
      }
    }

    if (fail === 0) {
      spinner.succeed(
        chalk.green(`${target.icon} ${target.label}`) +
        chalk.dim(` — ${ok} folder(s) deleted`)
      );
    } else {
      spinner.warn(
        chalk.yellow(`${target.icon} ${target.label}`) +
        chalk.dim(` — ${ok} deleted, ${fail} failed`)
      );
    }
    deleted += ok;
  }

  console.log();
  console.log(
    chalk.bold(`  ✓ Done! Deleted ${deleted} folder(s), freed `) +
    chalk.green.bold(formatSize(freed))
  );
  console.log();

  await promptContinue();
  return showDevCleanMenu();
}

// ─── Global caches ─────────────────────────────────────────────────────────

async function runGlobalClean() {
  console.log();
  const spinner = ora({ text: chalk.dim('Checking global caches...'), color: 'cyan' }).start();

  // Build choices with sizes
  const choices = [];
  for (const target of GLOBAL_TARGETS) {
    const cachePath = target.getPath();
    const exists = existsSync(cachePath);
    const size = exists ? getDirSize(cachePath) : 0;

    choices.push({
      name:
        `${target.icon} ${chalk.bold(target.label)}` +
        chalk.dim(`  ${target.description}  `) +
        (size > 0 ? chalk.yellow(formatSize(size)) : chalk.dim('n/a')),
      value: target,
      checked: false,
      disabled: !exists && size === 0 ? chalk.dim('not found') : false,
    });
  }

  spinner.stop();

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: chalk.bold('Select global caches to clear:'),
      choices,
      pageSize: 15,
    },
  ]);

  if (selected.length === 0) {
    console.log(chalk.dim('\n  Nothing selected.\n'));
    await promptContinue();
    return showDevCleanMenu();
  }

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: chalk.red.bold(`Clear ${selected.length} global cache(s)?`),
      default: false,
    },
  ]);

  if (!confirmed) {
    console.log(chalk.dim('\n  Cancelled.\n'));
    await promptContinue();
    return showDevCleanMenu();
  }

  console.log();

  for (const target of selected) {
    const spinner = ora({ text: `Clearing ${target.label}...`, color: 'cyan' }).start();
    const result = await target.clearFn();

    if (result.success) {
      spinner.succeed(chalk.green(`${target.icon} ${target.label} cleared`));
    } else {
      spinner.warn(chalk.yellow(`${target.icon} ${target.label}`) + chalk.dim(` — ${result.error}`));
    }
  }

  console.log();
  console.log(chalk.bold('  ✓ Global caches cleared!'));
  console.log();

  await promptContinue();
  return showDevCleanMenu();
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function printDevHeader() {
  console.log();
  console.log(
    `  ${chalk.yellow('⚡')} ${chalk.bold('Dev Cleanup')}  ` +
    chalk.dim(`scanning: ${chalk.cyan(process.cwd())}`)
  );
  console.log(chalk.dim('  ─────────────────────────────────────────────'));
  console.log();
}

async function promptContinue() {
  await inquirer.prompt([
    {
      type: 'input',
      name: '_',
      message: chalk.dim('Press Enter to continue...'),
    },
  ]);
}
