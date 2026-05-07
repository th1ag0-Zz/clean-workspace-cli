# devclean 🧹

> CLI helper to clean your dev environment — fast, interactive, and safe.

Scans your current working directory (or global caches) and lets you selectively delete accumulated junk from day-to-day development.

## Install

```bash
npm install -g clean-workspace-cli
# or
npx clean-workspace-cli
```

## Usage

```bash
cw
```

Run it from inside any project folder — it will scan from that directory down.

## Features

### ⚡ Dev Cleanup

Scans the **current directory** recursively for:

| Target | Description |
|--------|-------------|
| `node_modules` | Node.js dependency folders |
| `.next` | Next.js build cache |
| `dist` / `build` / `out` | Build output directories |
| `.turbo` | Turborepo local cache |
| `.parcel-cache` | Parcel bundler cache |
| `.vite` | Vite build cache |
| `.swc` | SWC compiler cache |
| `.expo` | Expo local project cache |
| `android/build` | Android build artifacts |
| `ios/build` + `Pods` | iOS build artifacts |
| `coverage` | Test coverage reports |
| `storybook-static` | Storybook build output |

### 🌐 Global Caches

Clears global caches **outside** of your project:

- **npm** global cache
- **Yarn** global cache
- **pnpm** store
- **Bun** cache
- **Gradle** caches (`~/.gradle/caches`)
- **CocoaPods** cache
- **Metro** bundler `/tmp` cache

### 🖥 System Cleanup *(coming soon)*

System-level cleanup: Trash, Downloads, old logs, etc.

## Requirements

- Node.js ≥ 18
- macOS (primary support; Linux coming soon)

## License

MIT
