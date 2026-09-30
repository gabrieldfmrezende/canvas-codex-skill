# Canvas LMS skill

Languages: English | [Português (Brasil)](README.pt-BR.md)

Read Canvas courses and files from an agent that supports local skills. Windows, macOS and Linux share a guided setup; credentials stay in your OS vault. Downloads occur only when requested.

## Install and connect

You need **Node.js 22.20+ with npm**, an agent supported by the skills CLI, and a Canvas account allowed to create a personal access token.

```sh
npx --yes skills@1.7.0 add gabrieldfmrezende/canvas-codex-skill
```

Select your agent(s) and global or project installation. Enter the installed skill directory reported by the installer, then run:

```sh
node scripts/setup.mjs configure
```

For Windows PowerShell with restricted script execution, use `npx.cmd` instead of `npx`; no policy change is required for Node scripts. To install directly for selected agents, for example:

```sh
npx --yes skills@1.7.0 add gabrieldfmrezende/canvas-codex-skill --agent codex claude-code --skill canvas --global --yes --copy
```

The assistant installs the pinned vault dependency locally using the included lockfile; it may take a few minutes. npm lifecycle scripts are disabled. Updates through the skills CLI may remove dependencies; rerun the assistant afterward.

The assistant asks for your institution's HTTPS Canvas URL (a course URL also works), guides token creation and accepts the token in a **hidden prompt**. In Canvas, open **Account > Settings > Approved Integrations > New Access Token** and choose a short expiration. If the institution disables token creation, contact its administrator.

After checking your profile, setup saves the URL and token together and shows the connected account. Start a new session in your selected agent and ask it to list your Canvas courses. Use `--lang pt-BR` or `--lang en` to override automatic language detection.

This is a personal local token workflow. Applications seeking authorization from other users should use Canvas OAuth. [Canvas token guide](https://community.instructure.com/en/kb/articles/662901-how-do-i-manage-api-access-tokens-in-my-user-account), [OAuth documentation](https://canvas.instructure.com/doc/api/file.oauth.html).

## Credentials and migration

One Canvas account is saved per OS user, shared across installed agents and projects:

- Windows: Credential Manager.
- macOS: Keychain; allow the system access prompt when needed.
- Linux: an unlocked Secret Service provider (for example GNOME Keyring or KeePassXC with Secret Service enabled) and a session D-Bus service.

No token is written to a configuration file. If the vault is unavailable, unlock/enable it and retry, or provide a complete environment pair for temporary use. Headless Linux sessions may require a Secret Service provider; there is no automatic plaintext fallback.

The helper selects **both** `CANVAS_BASE_URL` and `CANVAS_API_TOKEN` from the process environment first. If neither exists, Windows also checks the legacy persistent user environment. Otherwise it reads the vault. A partial pair stops with an error; values are never mixed across sources.

Setup offers to migrate an existing complete pair after validating the profile. Variables are preserved and continue to override the vault. The assistant can show removal commands; you choose whether to run them. It cannot alter its parent terminal's environment. Restart existing agent/terminal processes after removing persistent variables.

On Windows, remove old variables from both persistent user storage and the current terminal:

```powershell
[Environment]::SetEnvironmentVariable('CANVAS_BASE_URL', $null, 'User')
[Environment]::SetEnvironmentVariable('CANVAS_API_TOKEN', $null, 'User')
Remove-Item Env:CANVAS_BASE_URL, Env:CANVAS_API_TOKEN -ErrorAction SilentlyContinue
```

On macOS/Linux, run `unset CANVAS_BASE_URL CANVAS_API_TOKEN` and remove old exports from your shell configuration. Never paste tokens into chat, command arguments, URLs, screenshots or version-controlled files.

## Diagnose and automate

```sh
node scripts/setup.mjs doctor
node scripts/setup.mjs doctor --json
node scripts/setup.mjs remove
```

Diagnosis is read-only: it validates the profile, reports the selected credential source and returns one JSON document with `--json`. It does not install dependencies. Removal asks for confirmation and deletes only the vault entry; environment variables and the Canvas-side token remain intact. Use `remove --yes` for automation; revoke the token in Canvas when needed.

For unattended setup, supply `CANVAS_API_TOKEN` through a secret manager or process environment, then:

```sh
node scripts/setup.mjs configure --non-interactive --base-url https://your-institution.instructure.com
```

Add `--replace` to replace an existing vault entry explicitly. The URL may also come from `CANVAS_BASE_URL`. No token argument is accepted, no question is asked, and invalid connections leave previous credentials unchanged.

Exit codes: **0** success, **2** configuration/arguments, **3** authentication (401), **4** network/request failure, **5** vault, **6** permissions (403), **7** file I/O, **8** runtime/dependency, **130** cancellation.

If bootstrap fails, check npm, the network and write access to the installed directory. From that directory run `npm ci --omit=dev --ignore-scripts` (`npm.cmd` on restricted Windows PowerShell), then retry setup.

## Use the helper

Run from the installed skill directory. The Node helper returns JSON.

```sh
node scripts/canvas.mjs profile
node scripts/canvas.mjs courses
node scripts/canvas.mjs files --course-id 12345
node scripts/canvas.mjs download --file-id 67890 --output-path ./downloads/
```

An **existing directory** receives the Canvas filename. Otherwise the output path is treated as the final filename. Files are preserved unless you explicitly pass `--force`.

Existing PowerShell commands remain available with Node installed; they return PowerShell objects:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/canvas.ps1 -Action profile
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/canvas.ps1 -Action courses
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/canvas.ps1 -Action files -CourseId 12345
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/canvas.ps1 -Action download -FileId 67890 -OutputPath ./notes.pdf
```

`ExecutionPolicy Bypass` affects only that process. Use `pwsh` for PowerShell 7 on other platforms.

## Development and validation

```sh
npm ci --omit=dev --ignore-scripts
npm run check
npm test
```

Tests use dummy credentials and a simulated API, including real CLI/PowerShell subprocesses. CI runs the suite on Windows, macOS and Linux.

To test an **unlocked native vault**, set `CANVAS_TEST_VAULT=1` and run `node --test test/vault.test.mjs`. This creates a random, isolated dummy entry under `canvas-agent-skill-tests`, verifies reading from a new process and deletes it; it never reads the user's Canvas entry.

Before release, complete [manual installation and platform checks](docs/validation.md). Agent compatibility follows the skills CLI; full integration targets for this version are Codex and Claude Code.
