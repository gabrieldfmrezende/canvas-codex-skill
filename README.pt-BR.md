# Canvas LMS skill for Codex

Idiomas: [English](README.md) | Português (Brasil)

Skill pessoal do Codex para consultar cursos e arquivos do Canvas LMS pela API REST. O helper incluído é somente de leitura, exceto pelo download local solicitado pelo usuário.

## Requisitos

- Windows PowerShell 5.1 ou PowerShell 7+
- Node.js com npm/npx
- Uma conta do Canvas LMS com permissão para gerar token de acesso
- Codex com suporte a skills locais

## Gerar o token no Canvas

1. Entre na sua instância do Canvas LMS.
2. Abra **Conta > Configurações**.
3. Na seção **Integrações aprovadas**, selecione **Novo token de acesso**.
4. Informe uma finalidade, como `Codex Canvas`, e defina uma expiração curta.
5. Gere e copie o token imediatamente. O Canvas não mostra o valor completo novamente.

O token equivale à sua credencial dentro das permissões da conta. Não o coloque em comandos, arquivos versionados, capturas de tela ou mensagens.

## Configurar as variáveis de ambiente

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

Substitua `https://sua-instituicao.instructure.com` pela URL da sua instituição. Abra um novo terminal após configurar as variáveis. Variáveis persistentes do usuário são armazenadas pelo Windows e podem ser lidas por processos executados na mesma conta; prefira um token com expiração curta.

Verifique a configuração sem mostrar os valores:

```powershell
[bool][Environment]::GetEnvironmentVariable("CANVAS_API_TOKEN", "User")
[bool][Environment]::GetEnvironmentVariable("CANVAS_BASE_URL", "User")
```

## Instalar a skill

Instale a skill diretamente deste repositório:

```powershell
npx skills@latest add gabrieldfmrezende/canvas-codex-skill
```

Quando solicitado, selecione Codex. Escolha a instalação global para usar a skill em todos os projetos.

Reinicie o Codex ou abra uma nova sessão para que a skill seja descoberta.

## Testar e usar o helper

Execute estes comandos a partir do diretório da skill instalada, mostrado pelo instalador. Use `ExecutionPolicy Bypass` apenas no processo atual; a política permanente do Windows não é alterada.

```powershell
# Validar autenticação
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\canvas.ps1 -Action profile

# Listar cursos ativos
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\canvas.ps1 -Action courses

# Listar arquivos de um curso
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\canvas.ps1 -Action files -CourseId 12345

# Baixar um arquivo
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\canvas.ps1 -Action download -FileId 67890 -OutputPath .\downloads
```

O helper preserva arquivos existentes. A substituição exige `-Force` e deve ser usada somente quando desejada.

## Remover as credenciais

```powershell
[Environment]::SetEnvironmentVariable("CANVAS_API_TOKEN", $null, "User")
[Environment]::SetEnvironmentVariable("CANVAS_BASE_URL", $null, "User")

Remove-Item Env:CANVAS_API_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:CANVAS_BASE_URL -ErrorAction SilentlyContinue
```
