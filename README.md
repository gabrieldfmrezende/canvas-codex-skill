# Canvas LMS skill for Codex

Languages: English | [Português (Brasil)](README.pt-BR.md)

A personal Codex skill for accessing Canvas LMS courses and files through the REST API. The included helper is read-only, except when the user requests a local file download.

## Requirements

- Windows PowerShell 5.1 or PowerShell 7+
- Node.js with npm/npx
- A Canvas LMS account with permission to create an access token
- Codex with support for local skills

## Generate a Canvas access token

1. Sign in to your Canvas LMS instance.
2. Open **Account > Settings**.
3. Under **Approved Integrations**, select **New Access Token**.
4. Enter a purpose, such as `Codex Canvas`, and set a short expiration.
5. Generate and copy the token immediately. Canvas will not display the full value again.

The token acts as a credential within your account's permissions. Do not put it in commands, version-controlled files, screenshots, or messages.

## Set up environment variables

Run this in PowerShell. The token you enter will be hidden:

```powershell
$secureToken = Read-Host "Paste your Canvas token" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)

try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)

    [Environment]::SetEnvironmentVariable(
        "CANVAS_API_TOKEN",
        $token,
        "User"
    )

    [Environment]::SetEnvironmentVariable(
        "CANVAS_BASE_URL",
        "https://your-institution.instructure.com",
        "User"
    )
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    $token = $null
    $secureToken = $null
}
```

Replace `https://your-institution.instructure.com` with your institution's URL. Open a new terminal after setting the variables. Windows stores persistent user environment variables, which processes running under the same account can read; use a token with a short expiration.

Check that both variables are set without displaying their values:

```powershell
[bool][Environment]::GetEnvironmentVariable("CANVAS_API_TOKEN", "User")
[bool][Environment]::GetEnvironmentVariable("CANVAS_BASE_URL", "User")
```

## Install the skill

Install the skill from this repository:

```powershell
npx skills@latest add gabrieldfmrezende/canvas-codex-skill
```

When prompted, select Codex. Choose a global installation to use the skill across all projects.

Restart Codex or open a new session so it can discover the skill.

## Test and use the helper

Run these commands from the installed skill directory shown by the installer. `ExecutionPolicy Bypass` applies only to the current process; it does not change the permanent Windows policy.

```powershell
# Check authentication
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\canvas.ps1 -Action profile

# List active courses
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\canvas.ps1 -Action courses

# List files in a course
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\canvas.ps1 -Action files -CourseId 12345

# Download a file
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\canvas.ps1 -Action download -FileId 67890 -OutputPath .\downloads
```

The helper preserves existing files. Replacing a file requires `-Force`; use it only when you intend to overwrite the file.

## Remove the credentials

```powershell
[Environment]::SetEnvironmentVariable("CANVAS_API_TOKEN", $null, "User")
[Environment]::SetEnvironmentVariable("CANVAS_BASE_URL", $null, "User")

Remove-Item Env:CANVAS_API_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:CANVAS_BASE_URL -ErrorAction SilentlyContinue
```
