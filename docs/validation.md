# Release validation

## Automated checks

Run `npm ci --omit=dev --ignore-scripts`, `npm run check` and `npm test`. The workflow runs these on Windows, macOS and Linux; its presence alone does not establish that a remote CI run passed.

Native vault check: opt in with `CANVAS_TEST_VAULT=1`, then run `node --test test/vault.test.mjs`. It writes only an isolated dummy entry and tests a second process. On Linux, also run `doctor --json` without a Secret Service provider and confirm controlled recovery guidance, exit 5 and no plaintext persistence.

## Installation matrix

Use a local source directory during development, or a published branch/ref after review. In each OS, test Codex and Claude Code with both project and global installs using the skills CLI:

1. Install into a clean target, without copying a development `node_modules` directory.
2. Open the installed directory; run `node scripts/setup.mjs configure` from a different working directory using an absolute script path as well.
3. Confirm automatic dependency installation, HTTPS URL normalization and hidden token entry.
4. Cancel at replacement/token prompts. Confirm unchanged credentials and restored terminal echo.
5. Connect a personal account; confirm the displayed profile. Close the process, then run `doctor --json` and `canvas.mjs courses` in a new process.
6. Start a fresh agent session, confirm discovery and use the skill to list courses/files. Download only a requested test file; verify existing-file protection.
7. Reinstall/update the skill and confirm dependency bootstrap still works.

## Credential scenarios

- Complete environment pair overrides the vault and is reported by diagnosis.
- Partial process pair fails without reading another account's vault/Windows settings.
- Windows legacy persistent pair can be migrated; the values are preserved until explicitly removed by the user.
- Invalid/expired token, HTTP 403 and network failure do not replace the saved connection.
- Locked/unavailable vault provides guidance. No fallback file or persistent variable is created.
- `remove` asks for confirmation; `remove --yes` removes only the vault entry and warns about remaining variables. Revoke tokens separately in Canvas.
- Automated setup does not ask questions and requires `--replace` for an existing entry.
- Portuguese and English prompts/help/errors work. Tokens never appear in output, JSON, arguments or local files.

Record the OS/runtime, agent, installation scope and result for every manual check. Keep native macOS/Linux and live Canvas/agent verification separate from simulated API tests.

## Local implementation verification — 2026-09-29

- Windows / Node 24.18 / PowerShell 5.1: simulated API suite and all four adapter actions verified, including Unicode output and failure exit codes.
- Windows Credential Manager: isolated dummy entry written, read from a second process and deleted successfully.
- `skills@1.7.0`: clean local source installed by project for Codex and Claude Code in temporary directories; package/lockfile/helper were copied and the installed entry point ran from another working directory.
- Actual bootstrap in the copied Codex skill installed its dependency successfully without a separate npm command.
- Still pending before release: native macOS/Linux vaults, global installations, live Canvas authentication and discovery/use in fresh agent sessions. The CI matrix is configured but has not been run remotely by these local checks.
