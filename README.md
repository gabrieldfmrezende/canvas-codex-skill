# Canvas LMS skill for Codex

Skill pessoal do Codex para consultar cursos e arquivos do Canvas LMS pela API REST. O helper inclu°do Ç somente de leitura, exceto pelo download local solicitado pelo usu†rio.

## Requisitos

- Windows PowerShell 5.1 ou PowerShell 7+
- Uma conta do Canvas LMS com permiss∆o para gerar token de acesso
- Codex com suporte a skills locais

## Gerar o token no Canvas

1. Entre na sua instÉncia do Canvas LMS.
2. Abra **Conta > Configuraá‰es**.
3. Na seá∆o **Integraá‰es aprovadas**, selecione **Novo token de acesso**.
4. Informe uma finalidade, como `Codex Canvas`, e defina uma expiraá∆o curta.
5. Gere e copie o token imediatamente. O Canvas n∆o mostra o valor completo novamente.

O token equivale Ö sua credencial dentro das permiss‰es da conta. N∆o o coloque em comandos, arquivos versionados, capturas de tela ou mensagens.

## Configurar as vari†veis de ambiente

Execute no PowerShell. O token digitado fica oculto:

```powershell
$secureToken = Read-Host "Cole o token do Canvas" -AsSecureString
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
        "https://sua-instituicao.instructure.com",
        "User"
    )
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    $token = $null
    $secureToken = $null
}
```

Substitua `https://sua-instituicao.instructure.com` pela URL da sua instituiá∆o. Abra um novo terminal ap¢s configurar as vari†veis. Vari†veis persistentes do usu†rio s∆o armazenadas pelo Windows e podem ser lidas por processos executados na mesma conta; prefira um token com expiraá∆o curta.

Verifique a configuraá∆o sem mostrar os valores:

```powershell
[bool][Environment]::GetEnvironmentVariable("CANVAS_API_TOKEN", "User")
[bool][Environment]::GetEnvironmentVariable("CANVAS_BASE_URL", "User")
```

## Instalar a skill

Clone este reposit¢rio e copie a skill para o diret¢rio pessoal do Codex:

```powershell
git clone https://github.com/gabrieldfmrezende/canvas-codex-skill.git
cd canvas-codex-skill

$destination = Join-Path $env:USERPROFILE ".codex\skills\canvas"
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -LiteralPath ".\SKILL.md" -Destination $destination -Force
Copy-Item -LiteralPath ".\scripts" -Destination $destination -Recurse -Force
```

Reinicie o Codex ou abra uma nova sess∆o para que a skill seja descoberta.

## Testar e usar o helper

Use `ExecutionPolicy Bypass` apenas no processo atual; a pol°tica permanente do Windows n∆o Ç alterada.

```powershell
# Validar autenticaá∆o
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\canvas.ps1 -Action profile

# Listar cursos ativos
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\canvas.ps1 -Action courses

# Listar arquivos de um curso
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\canvas.ps1 -Action files -CourseId 12345

# Baixar um arquivo
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\canvas.ps1 -Action download -FileId 67890 -OutputPath .\downloads
```

O helper preserva arquivos existentes. A substituiá∆o exige `-Force` e deve ser usada somente quando desejada.

## Remover as credenciais

```powershell
[Environment]::SetEnvironmentVariable("CANVAS_API_TOKEN", $null, "User")
[Environment]::SetEnvironmentVariable("CANVAS_BASE_URL", $null, "User")

Remove-Item Env:CANVAS_API_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:CANVAS_BASE_URL -ErrorAction SilentlyContinue
```
