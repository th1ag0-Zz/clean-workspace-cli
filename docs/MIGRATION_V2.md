# Migrating from devclean 1.x to 2.0

Version 2 keeps the interactive `cw` dashboard, but all deletion now flows
through a scan result, cleanup plan, central path policy, and executor.

## What changes

- `cw` remains interactive and now includes Smart Scan and cleanup history.
- `cw scan` is a new read-only command suitable for scripts.
- Scripted cleanup never deletes unless `--apply` is present.
- `--yes` skips prompts but never bypasses path validation.
- `safe` and `deep` replace implicit broad cleanup choices. `deep` still
  excludes sensitive user data.
- Sensitive targets require explicit `--target` selection.
- Every applied cleanup writes a local receipt.
- Global configuration and `.devcleanignore` can exclude paths.

## Recommended migration

1. Run `cw scan --all` and review the new risk labels.
2. Create the default configuration with `cw config init`.
3. Add generated or protected workspace paths to `.devcleanignore`.
4. Replace automation with a dry-run first:

   ```bash
   cw clean . --preset safe --dry-run --json
   ```

5. After reviewing the plan, add explicit application:

   ```bash
   cw clean . --preset safe --apply --yes --json
   ```

6. Inspect the execution with `cw history --limit 1 --json`.

## Behavior differences

Global package-manager caches are resolved to concrete paths during scanning
and only those approved paths are removed. Shell-interpolated deletion and
`rm -rf` are no longer used. A path that changes, crosses a symlink, leaves its
allowed root, or becomes unreadable between scan and execution is rejected and
recorded as an item failure instead of stopping unrelated items.

The v1 menu choices remain available, but now honor v2 exclusions, safety
validation, interruption handling, and receipts.
