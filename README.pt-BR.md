# Skill do Canvas LMS

Idiomas: [English](README.md) | Português (Brasil)

Consulte cursos e arquivos do Canvas em agentes com suporte a skills locais. Windows, macOS e Linux compartilham um assistente de configuração; as credenciais ficam no cofre do sistema. Downloads ocorrem quando solicitados.

## Instalar e conectar

Você precisa de **Node.js 22.20+ com npm**, um agente suportado pelo skills CLI e uma conta Canvas com permissão para criar token pessoal.

```sh
npx --yes skills@1.7.0 add gabrieldfmrezende/canvas-codex-skill
```

Selecione os agentes e a instalação global ou por projeto. Entre no diretório da skill informado pelo instalador e execute:

```sh
node scripts/setup.mjs configure
```

No PowerShell do Windows com execução de scripts restrita, use `npx.cmd` no lugar de `npx`; os scripts Node dispensam alteração de política. Para instalar diretamente em agentes escolhidos, por exemplo:

```sh
npx --yes skills@1.7.0 add gabrieldfmrezende/canvas-codex-skill --agent codex claude-code --skill canvas --global --yes --copy
```

O assistente instala a dependência do cofre localmente usando as versões do lockfile; isso pode levar alguns minutos. Scripts de instalação do npm são desabilitados. Atualizações pelo skills CLI podem remover dependências; execute o assistente novamente depois.

Informe a URL HTTPS do Canvas da instituição (uma URL de curso também funciona). O assistente orienta a criação do token e recebe-o em uma **entrada oculta**. No Canvas, abra **Conta > Configurações > Integrações aprovadas > Novo token de acesso** e escolha uma expiração curta. Se a instituição bloquear essa opção, contate o administrador.

Após validar o perfil, o assistente salva URL e token juntos e mostra a conta conectada. Abra uma nova sessão no agente escolhido e peça para listar seus cursos. Use `--lang pt-BR` ou `--lang en` para escolher o idioma explicitamente.

Este é um fluxo pessoal e local com token. Aplicações que solicitam autorização de outros usuários devem usar OAuth do Canvas. [Guia oficial de tokens](https://community.instructure.com/en/kb/articles/662901-how-do-i-manage-api-access-tokens-in-my-user-account), [Documentação de OAuth](https://canvas.instructure.com/doc/api/file.oauth.html).

## Credenciais e migração

Uma conta Canvas é salva por usuário do sistema, compartilhada entre agentes e projetos:

- Windows: Gerenciador de Credenciais.
- macOS: Chaves; autorize o acesso solicitado pelo sistema quando necessário.
- Linux: provedor Secret Service desbloqueado (por exemplo GNOME Keyring ou KeePassXC com Secret Service habilitado) e D-Bus de sessão.

Nenhum token é gravado em arquivo de configuração. Se o cofre estiver indisponível, habilite/desbloqueie-o e tente novamente, ou forneça um par completo de variáveis para uso temporário. Sessões Linux sem interface gráfica podem precisar de um provedor Secret Service; não há fallback automático para texto simples.

O helper prioriza **ambas** as variáveis `CANVAS_BASE_URL` e `CANVAS_API_TOKEN` do processo. Se nenhuma existir, o Windows também verifica o ambiente persistente do usuário usado pela versão anterior. Na ausência, consulta o cofre. Um par parcial gera erro; valores de fontes diferentes nunca são combinados.

O assistente oferece migrar um par existente após validar o perfil. As variáveis são preservadas e continuam tendo prioridade. Ele pode mostrar os comandos de remoção; você escolhe executá-los. O assistente não altera o ambiente do terminal que o iniciou. Reinicie agentes/terminais existentes depois de remover variáveis persistentes.

No Windows, remova as variáveis antigas do usuário e do terminal atual:

```powershell
[Environment]::SetEnvironmentVariable('CANVAS_BASE_URL', $null, 'User')
[Environment]::SetEnvironmentVariable('CANVAS_API_TOKEN', $null, 'User')
Remove-Item Env:CANVAS_BASE_URL, Env:CANVAS_API_TOKEN -ErrorAction SilentlyContinue
```

No macOS/Linux, execute `unset CANVAS_BASE_URL CANVAS_API_TOKEN` e remova exports antigos da configuração do shell. Mantenha tokens fora de conversas, argumentos de comandos, URLs, capturas de tela e arquivos versionados.

## Diagnosticar e automatizar

```sh
node scripts/setup.mjs doctor
node scripts/setup.mjs doctor --json
node scripts/setup.mjs remove
```

O diagnóstico é somente de leitura: valida o perfil, informa a origem das credenciais e retorna um único documento JSON com `--json`. Não instala dependências. A remoção pede confirmação e exclui apenas a entrada do cofre; preserva variáveis e o token no Canvas. Use `remove --yes` para automação; revogue o token no Canvas quando necessário.

Para configuração sem interação, forneça `CANVAS_API_TOKEN` por gerenciador de segredos ou ambiente do processo e execute:

```sh
node scripts/setup.mjs configure --non-interactive --base-url https://sua-instituicao.instructure.com
```

Adicione `--replace` para substituir uma entrada existente no cofre explicitamente. A URL também pode vir de `CANVAS_BASE_URL`. Não há argumento para token nem perguntas, e conexões inválidas preservam as credenciais anteriores.

Códigos de saída: **0** sucesso, **2** configuração/argumentos, **3** autenticação (401), **4** rede/requisição, **5** cofre, **6** permissões (403), **7** arquivos, **8** runtime/dependência, **130** cancelamento.

Se a instalação da dependência falhar, verifique npm, rede e permissões no diretório instalado. Nesse diretório, execute `npm ci --omit=dev --ignore-scripts` (`npm.cmd` no PowerShell restrito) e tente o assistente novamente.

## Usar o helper

Execute no diretório da skill instalada. O helper Node retorna JSON.

```sh
node scripts/canvas.mjs profile
node scripts/canvas.mjs courses
node scripts/canvas.mjs files --course-id 12345
node scripts/canvas.mjs download --file-id 67890 --output-path ./downloads/
```

Um **diretório existente** recebe o nome do arquivo do Canvas. Caso contrário, o caminho é tratado como nome final do arquivo. Arquivos existentes são preservados, exceto quando você passa `--force` explicitamente.

Os comandos PowerShell anteriores continuam disponíveis com Node instalado e retornam objetos PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/canvas.ps1 -Action profile
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/canvas.ps1 -Action courses
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/canvas.ps1 -Action files -CourseId 12345
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/canvas.ps1 -Action download -FileId 67890 -OutputPath ./notes.pdf
```

`ExecutionPolicy Bypass` afeta apenas esse processo. Use `pwsh` para PowerShell 7 nos demais sistemas.

## Desenvolvimento e validação

```sh
npm ci --omit=dev --ignore-scripts
npm run check
npm test
```

Os testes usam credenciais fictícias e API simulada, incluindo subprocessos reais do CLI e PowerShell. O CI executa a suíte nos três sistemas.

Para testar um **cofre nativo desbloqueado**, defina `CANVAS_TEST_VAULT=1` e execute `node --test test/vault.test.mjs`. O teste cria uma entrada fictícia e aleatória em `canvas-agent-skill-tests`, verifica a leitura em outro processo e exclui a entrada; não acessa as credenciais Canvas do usuário.

Antes de publicar, conclua as [verificações manuais de instalação e plataformas](docs/validation.md). A compatibilidade de agentes acompanha o skills CLI; os alvos de integração completa nesta versão são Codex e Claude Code.
