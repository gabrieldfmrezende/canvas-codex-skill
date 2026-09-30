[CmdletBinding()]
param(
    [ValidateSet('profile', 'courses', 'files', 'download')]
    [string]$Action = 'profile',
    [int]$CourseId,
    [int]$FileId,
    [string]$OutputPath,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'Node.js 22.20+ is required. Install Node.js and npm, then retry.' -ErrorAction Continue
    exit 8
}
$helperArguments = @((Join-Path $PSScriptRoot 'canvas.mjs'), $Action)
if ($Action -eq 'files') { $helperArguments += @('--course-id', "$CourseId") }
if ($Action -eq 'download') {
    $helperArguments += @('--file-id', "$FileId", '--output-path', $OutputPath)
    if ($Force) { $helperArguments += '--force' }
}
# Node resolves legacy user variables internally. No token is passed as an argument.
$previousEncoding = [Console]::OutputEncoding
try {
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
    # PowerShell 5.1 wraps native stderr as ErrorRecord; preserve Node's exit code.
    $ErrorActionPreference = 'Continue'
    $json = & node @helperArguments
    $helperExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($helperExitCode -ne 0) { exit $helperExitCode }
    if ($json) {
        $result = ($json -join "`n") | ConvertFrom-Json
        foreach ($item in $result) { $item }
    }
}
finally {
    [Console]::OutputEncoding = $previousEncoding
}
