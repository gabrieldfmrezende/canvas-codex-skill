---
name: canvas
description: Access Canvas LMS courses and course files when the user asks to inspect, list, or download materials from their Canvas account. Use for Canvas LMS, not the Canva design service.
---

# Canvas LMS

Use `scripts/canvas.ps1` for authenticated, read-only access to the user's Canvas LMS account.

## Authentication

The helper reads these variables without displaying their values:

- `CANVAS_BASE_URL`, such as `https://pucminas.instructure.com`
- `CANVAS_API_TOKEN`

It first checks the current process environment and then the persistent Windows user environment. If either value is absent, stop and ask the user to configure it locally. Keep the bearer token out of output, command arguments, URLs, files, logs, and error messages.

## Workflow

1. Verify access with `scripts/canvas.ps1 -Action profile`.
2. Resolve the course with `scripts/canvas.ps1 -Action courses`. Use the numeric `id`; course names and codes may be duplicated.
3. List every accessible course file with `scripts/canvas.ps1 -Action files -CourseId <id>`. The helper follows Canvas pagination.
4. Download only when the user requests it: `scripts/canvas.ps1 -Action download -FileId <id> -OutputPath <path>`. Existing files are preserved unless the user authorizes replacement and `-Force` is passed.

Present file names, course names, sizes, and timestamps rather than raw API payloads unless the user asks for raw data. Treat HTTP 401 as an invalid or expired token and HTTP 403 as insufficient Canvas permissions. Preserve the user's scope: listing or inspecting does not authorize uploads, edits, submissions, grading, or deletions.

