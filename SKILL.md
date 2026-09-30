---
name: canvas
description: Access Canvas LMS courses and course files when the user asks to inspect, list, or download materials from their Canvas account. Use for Canvas LMS, not the Canva design service.
---

# Canvas LMS

Run the Node helper from this installed skill's directory. Node.js 22.20+ is required; the helper works across Windows, macOS and Linux.

## Connection

1. Run `node scripts/setup.mjs doctor --json`. Continue when it returns `ok: true`.
2. For missing settings, dependency or vault errors, guide the user to run `node scripts/setup.mjs configure` in their own terminal, using the installed skill directory. The assistant installs its pinned vault dependency locally, prompts for the institution URL and a hidden token, and verifies the profile before saving. Consult [README.md](README.md) or [README.pt-BR.md](README.pt-BR.md) for platform-specific recovery.
3. Retry the diagnosis once the user finishes configuration. Report authentication failures as an invalid/expired token, and permission failures as restricted access.

The credential source is the complete pair `CANVAS_BASE_URL` and `CANVAS_API_TOKEN`, then the legacy Windows user pair if neither process variable exists, then the system vault. A partial pair is an error; use both variables or remove both. The vault uses one account per OS user, shared across agents/projects.

Keep the token inside the user's hidden local prompt, process environment or system vault. Never ask for it in chat, pass it in command arguments/URLs, or display it in output, logs, files or errors. Diagnose with the helper's controlled messages, without printing credentials or native error details.

## Read-only workflow

1. Resolve courses: `node scripts/canvas.mjs courses`. Use numeric IDs; names and codes may be duplicated.
2. List files: `node scripts/canvas.mjs files --course-id <id>`. Pagination is automatic.
3. When the user requests a download: `node scripts/canvas.mjs download --file-id <id> --output-path <path>`. Existing files are preserved. Pass `--force` only with authorization to overwrite.

The helper returns JSON; present relevant course/file names, sizes and dates. Use `profile` for account details only when needed. Listing does not authorize downloads, uploads, edits, submissions, grading or deletions.

For existing PowerShell integrations, `scripts/canvas.ps1` preserves `-Action`, `-CourseId`, `-FileId`, `-OutputPath` and `-Force`, and returns PowerShell objects. Node remains required.
