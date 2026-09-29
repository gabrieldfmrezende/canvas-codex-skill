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

function Get-CanvasSetting {
    param([Parameter(Mandatory = $true)][string]$Name)

    $processValue = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($processValue)) {
        return $processValue
    }

    return [Environment]::GetEnvironmentVariable($Name, 'User')
}

function Get-NextCanvasLink {
    param([object]$LinkHeader)

    if (-not $LinkHeader) {
        return $null
    }

    foreach ($part in ((($LinkHeader -join ',') -split ','))) {
        if ($part -match '<([^>]+)>;\s*rel="next"') {
            return $Matches[1]
        }
    }

    return $null
}

function Invoke-CanvasJson {
    param([Parameter(Mandatory = $true)][string]$Url)

    try {
        return Invoke-RestMethod -Uri $Url -Headers $script:CanvasHeaders -Method Get
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 401) {
            throw 'Canvas recusou a autenticacao (HTTP 401). Verifique ou renove CANVAS_API_TOKEN.'
        }
        if ($statusCode -eq 403) {
            throw 'Canvas recusou o acesso (HTTP 403). A conta nao tem permissao para este recurso.'
        }
        throw
    }
}

function Invoke-CanvasPagedJson {
    param([Parameter(Mandatory = $true)][string]$Url)

    $items = [System.Collections.Generic.List[object]]::new()
    $nextUrl = $Url

    while ($nextUrl) {
        try {
            $response = Invoke-WebRequest -Uri $nextUrl -Headers $script:CanvasHeaders -Method Get -UseBasicParsing
        }
        catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            if ($statusCode -eq 401) {
                throw 'Canvas recusou a autenticacao (HTTP 401). Verifique ou renove CANVAS_API_TOKEN.'
            }
            if ($statusCode -eq 403) {
                throw 'Canvas recusou o acesso (HTTP 403). A conta nao tem permissao para este recurso.'
            }
            throw
        }

        $page = $response.Content | ConvertFrom-Json
        foreach ($item in $page) {
            $items.Add($item)
        }

        $nextUrl = Get-NextCanvasLink -LinkHeader $response.Headers['Link']
    }

    return $items.ToArray()
}

$canvasToken = Get-CanvasSetting -Name 'CANVAS_API_TOKEN'
$canvasBaseUrl = Get-CanvasSetting -Name 'CANVAS_BASE_URL'

if ([string]::IsNullOrWhiteSpace($canvasToken)) {
    throw 'CANVAS_API_TOKEN nao esta configurada no ambiente do processo nem do usuario.'
}
if ([string]::IsNullOrWhiteSpace($canvasBaseUrl)) {
    throw 'CANVAS_BASE_URL nao esta configurada no ambiente do processo nem do usuario.'
}

$canvasBaseUrl = $canvasBaseUrl.TrimEnd('/')
$script:CanvasHeaders = @{
    Authorization = "Bearer $canvasToken"
    Accept = 'application/json'
}

try {
    switch ($Action) {
        'profile' {
            $profile = Invoke-CanvasJson -Url "$canvasBaseUrl/api/v1/users/self/profile"
            [pscustomobject]@{
                id = $profile.id
                name = $profile.name
                primary_email = $profile.primary_email
            }
        }

        'courses' {
            $url = "$canvasBaseUrl/api/v1/courses?enrollment_state=active&state%5B%5D=available&include%5B%5D=term&per_page=100"
            Invoke-CanvasPagedJson -Url $url |
                Sort-Object name |
                ForEach-Object {
                    [pscustomobject]@{
                        id = $_.id
                        name = $_.name
                        course_code = $_.course_code
                        term = $_.term.name
                    }
                }
        }

        'files' {
            if ($CourseId -le 0) {
                throw 'Informe -CourseId com o ID numerico do curso.'
            }

            $url = "$canvasBaseUrl/api/v1/courses/$CourseId/files?per_page=100"
            Invoke-CanvasPagedJson -Url $url |
                Sort-Object display_name |
                ForEach-Object {
                    [pscustomobject]@{
                        id = $_.id
                        name = $_.display_name
                        content_type = $_.'content-type'
                        size = $_.size
                        updated_at = $_.updated_at
                        locked = $_.locked
                    }
                }
        }

        'download' {
            if ($FileId -le 0) {
                throw 'Informe -FileId com o ID numerico do arquivo.'
            }
            if ([string]::IsNullOrWhiteSpace($OutputPath)) {
                throw 'Informe -OutputPath como diretorio ou caminho final do arquivo.'
            }

            $file = Invoke-CanvasJson -Url "$canvasBaseUrl/api/v1/files/$FileId"
            $safeName = $file.display_name
            foreach ($invalidCharacter in [IO.Path]::GetInvalidFileNameChars()) {
                $safeName = $safeName.Replace($invalidCharacter, '_')
            }

            if (Test-Path -LiteralPath $OutputPath -PathType Container) {
                $destination = Join-Path $OutputPath $safeName
            }
            else {
                $destination = $OutputPath
            }

            if ((Test-Path -LiteralPath $destination) -and -not $Force) {
                throw "O arquivo ja existe: $destination. Use -Force somente com autorizacao para substituir."
            }

            $parent = Split-Path -Parent $destination
            if ($parent -and -not (Test-Path -LiteralPath $parent)) {
                New-Item -ItemType Directory -Path $parent -Force | Out-Null
            }

            Invoke-WebRequest -Uri $file.url -Headers $script:CanvasHeaders -OutFile $destination -UseBasicParsing
            Get-Item -LiteralPath $destination | Select-Object FullName, Length, LastWriteTime
        }
    }
}
finally {
    $canvasToken = $null
    $script:CanvasHeaders = $null
}
