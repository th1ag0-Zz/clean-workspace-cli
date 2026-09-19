# devclean 🧹

> CLI helper to clean your dev environment — fast, interactive, and safe.

Scans your current working directory (or global caches) and lets you selectively delete accumulated junk from day-to-day development.

## Install

```bash
npm install -g clean-workspace-cli
# or
npx clean-workspace-cli

# v2 beta
npm install -g clean-workspace-cli@beta
```

## Usage

```bash
cw

# Read-only Smart Scan
cw scan [path]
cw scan --all
cw scan --system
cw scan --all --category workspace,global-cache --risk safe,review
cw scan --json
```

Run it from inside any project folder — it will scan from that directory down.

`cw scan` is always read-only. `--all` combines workspace artifacts, global
development caches, and supported system locations in one report. Filters accept
comma-separated values:

- Categories: `workspace`, `global-cache`, `system`
- Risks: `safe`, `review`, `sensitive`

### JSON output

`cw scan --json` emits schema version `1`. Its top-level fields are
`schemaVersion`, `command`, `cliVersion`, `scannedAt`, `scope`, `filters`,
`summary`, and `targets`. Sizes are expressed in bytes. Paths are absolute;
workspace items also include `relativePath`.

```text
summary: { scannedTargetCount, targetCount, itemCount, reclaimableBytes,
           byRisk, recommendation: { code, message } }
targets[]: { id, category, risk, label, description, scopeRoot, itemCount,
             reclaimableBytes, items[] }
items[]: { path, relativePath, name, size, type, modifiedAt }
```

`scannedAt` is ISO 8601 and `modifiedAt` is Unix time in milliseconds. With
`--json`, failures return `{ schemaVersion, command, error: { code, message } }`
on stderr.

Non-interactive exit codes:

| Code | Meaning |
|------|---------|
| `0` | Scan completed, including when no items were found |
| `1` | Unexpected operational failure |
| `2` | Invalid arguments or unreadable/nonexistent workspace path |

## Controlled cleanup

```bash
# Interactive selection and confirmation
cw clean [path]

# Inspect the exact plan without changing files
cw clean --preset safe --dry-run
cw clean --all --preset deep --dry-run --json
cw clean --target dist,node_modules --dry-run

# Non-interactive execution requires --apply
cw clean --preset safe --apply --yes
cw clean --all --target npm_cache --apply --yes
```

The `safe` preset contains only cheap, reproducible workspace artifacts. The
`deep` preset adds review-level items such as `node_modules`, Pods, and global
development caches when their scope is included with `--all`. Neither preset
ever selects sensitive system targets. Sensitive targets require an explicit
`--target`; interactive execution additionally requires a typed confirmation.

Without `--apply`, preset and target commands are dry-runs. `--yes` is accepted
only with `--apply`. JSON application also requires `--yes`, ensuring prompts
never contaminate JSON output.

Cleanup exit codes:

| Code | Meaning |
|------|---------|
| `0` | Dry-run, cancellation, or successful cleanup |
| `1` | Operational or partial item failure |
| `2` | Invalid arguments or missing required confirmation mode |
| `130` | Cleanup interrupted by `SIGINT` or `SIGTERM` |

Every applied cleanup writes a JSON receipt under
`~/.config/devclean/history`. Use `cw history` or `cw history --json` to inspect
the latest receipts, including per-item results and errors.

## Configuration and exclusions

Run `cw config init` to create `~/.config/devclean/config.json`, and
`cw config show` to inspect the effective configuration:

```json
{
  "ignore": [],
  "concurrency": 8,
  "defaultPreset": "safe",
  "sensitivePolicy": "confirm"
}
```

Relative entries in `ignore` are workspace glob patterns; absolute entries
exclude that path and its descendants from all scan scopes. A workspace can
add patterns to `.devcleanignore`, one per line, with `#` comments. Set
`sensitivePolicy` to `deny` to disable sensitive cleanup entirely.

See the complete [CLI reference](docs/CLI.md) and the
[v1 to v2 migration guide](docs/MIGRATION_V2.md).

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

### 🖥 System Cleanup

Scans macOS user locations and lets you selectively delete:

- Everything currently in the **Trash**
- Top-level items in **Downloads** untouched for at least 30 days
- App entries in `~/Library/Logs` untouched for at least 30 days
- Per-user caches from **installed apps** in `~/Library/Caches`
- Per-user caches managed by **macOS and Apple apps** in `~/Library/Caches`

Folders are only considered old when none of their contents were modified in
the last 30 days. Cache groups can contain recent items because their contents
are disposable and recreated by their owning app or macOS. Every cleanup
requires an explicit selection and confirmation; system-wide `/Library/Caches`
is never touched and the CLI never requests administrator privileges.

## Requirements

- Node.js ≥ 18
- macOS (primary support; Linux coming soon)

## License

MIT
