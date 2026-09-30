import { CanvasError, isMain, parseArgs, requireRuntime, resolveCredentials } from './lib/core.mjs';
import { createClient } from './lib/api.mjs';
import { language, safeError } from './lib/messages.mjs';

export const helperHelp = `Canvas read-only helper (JSON output)
  node scripts/canvas.mjs profile
  node scripts/canvas.mjs courses
  node scripts/canvas.mjs files --course-id <id>
  node scripts/canvas.mjs download --file-id <id> --output-path <path> [--force]
  Options: --lang pt-BR|en, --help
  Credentials: complete Canvas environment pair, otherwise the system vault.
  Setup: node scripts/setup.mjs configure`;

const helperHelpPt = `Helper somente de leitura do Canvas (saída JSON)
  node scripts/canvas.mjs profile
  node scripts/canvas.mjs courses
  node scripts/canvas.mjs files --course-id <id>
  node scripts/canvas.mjs download --file-id <id> --output-path <caminho> [--force]
  Opções: --lang pt-BR|en, --help
  Credenciais: par completo de variáveis Canvas; na ausência, cofre do sistema.
  Configuração: node scripts/setup.mjs configure`;

export async function runHelper(argv, { resolve = resolveCredentials, clientFactory = createClient } = {}) {
  const { command = 'profile', options } = parseArgs(argv, {
    commands: ['profile', 'courses', 'files', 'download'],
    values: ['course-id', 'file-id', 'output-path', 'lang'], flags: ['force', 'help'],
  });
  if (options.help) return { help: language(options.lang) === 'pt-BR' ? helperHelpPt : helperHelp };
  if ((options['course-id'] && command !== 'files') || ((options['file-id'] || options['output-path'] || options.force) && command !== 'download')) throw new CanvasError('usage', 'arguments');
  const courseId = Number(options['course-id']);
  const fileId = Number(options['file-id']);
  if (command === 'files' && (!Number.isSafeInteger(courseId) || courseId <= 0)) throw new CanvasError('usage', 'arguments');
  if (command === 'download' && (!Number.isSafeInteger(fileId) || fileId <= 0 || !options['output-path'])) throw new CanvasError('usage', 'arguments');
  const client = clientFactory(await resolve());
  if (command === 'profile') return client.profile();
  if (command === 'courses') return client.courses();
  if (command === 'files') return client.files(courseId);
  return client.download(fileId, options['output-path'], { force: Boolean(options.force) });
}

if (isMain(import.meta.url)) {
  try {
    requireRuntime();
    const result = await runHelper(process.argv.slice(2));
    process.stdout.write(result.help ? `${result.help}\n` : `${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const lang = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : undefined;
    process.stderr.write(`${safeError(error, language(lang))}\n`);
    process.exitCode = error.exitCode ?? 1;
  }
}
