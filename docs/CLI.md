# devclean 2.0 CLI reference

## Dashboard

`cw` opens the interactive dashboard. It exposes the consolidated Smart Scan,
workspace cleanup, macOS system cleanup, global developer caches, and cleanup
history. Sensitive system targets are unchecked by default and require typed
confirmation.

## Scan

```bash
cw scan [path]
cw scan --all
cw scan --system
cw scan --all --category workspace,global-cache
cw scan --all --risk safe,review
cw scan [path] --json
```

Scan is always read-only. `--all` combines workspace, global-cache, and system
targets. `--system` scans system locations only. `--category` and `--risk`
accept comma-separated values.

## Clean

```bash
cw clean [path]                         # interactive
cw clean [path] --preset safe           # implicit dry-run
cw clean [path] --preset deep --dry-run
cw clean [path] --target dist,coverage --dry-run
cw clean [path] --preset safe --apply --yes
cw clean --all --preset deep --apply --yes
cw clean --system --target trash --apply
cw clean [path] --preset safe --apply --yes --json
```

`--apply` is the only non-interactive mode that deletes. Without it, explicit
presets and targets print a plan. `--yes` requires `--apply`. A JSON apply also
requires `--yes` so its output cannot contain prompts.

The `safe` preset selects cheap, reproducible workspace artifacts. `deep` adds
review-level targets, including dependency folders and global development
caches when `--all` is present. Neither preset selects sensitive targets.
Sensitive cleanup requires `--target`; without `--yes`, it also requires typed
confirmation.

## Configuration

```bash
cw config init
cw config init --force
cw config show
cw config show --json
```

Global configuration is stored at `~/.config/devclean/config.json`. Supported
fields are `ignore`, `concurrency`, `defaultPreset`, and `sensitivePolicy`.
Workspaces can add glob exclusions to `.devcleanignore`.

## History

```bash
cw history
cw history --limit 50
cw history --json
```

Receipts live under `~/.config/devclean/history`. Each receipt contains the
version, command, preset, selected targets, planned paths, estimated and
recovered bytes, per-item status, and errors.

## Automation examples

Inspect the safe plan in CI:

```bash
cw clean . --preset safe --dry-run --json > devclean-plan.json
```

Apply a known target and retain its receipt:

```bash
cw clean . --target coverage --apply --yes --json > devclean-result.json
cw history --limit 1 --json > devclean-receipt.json
```

Use exit codes in a shell script:

```bash
if ! cw clean . --preset safe --apply --yes --json; then
  echo "devclean reported a partial or operational failure" >&2
  exit 1
fi
```

Exit codes are `0` for success or dry-run, `1` for operational/partial failure,
`2` for invalid usage, and `130` for an interrupted cleanup.
