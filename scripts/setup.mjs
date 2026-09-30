import { bootstrap, CanvasError, createVault, environmentCredentials, isMain, parseArgs, requireRuntime, resolveCredentials, validateCredentials, windowsUserEnvironment } from './lib/core.mjs';
import { createClient } from './lib/api.mjs';
import { language, messages, safeError } from './lib/messages.mjs';
import { cleanDisplay, hiddenQuestion, question, removalCommands } from './lib/terminal.mjs';

export const setupHelp = `Canvas setup
  node scripts/setup.mjs [configure] [--lang pt-BR|en]
  node scripts/setup.mjs configure --non-interactive [--base-url <URL>] [--replace]
  node scripts/setup.mjs doctor [--json] [--lang pt-BR|en]
  node scripts/setup.mjs remove [--yes] [--lang pt-BR|en]
  Automation: provide CANVAS_API_TOKEN in the environment, never as an argument.
  Existing credentials: use --replace to allow automated replacement.
  remove deletes only the vault entry; environment variables are preserved.
  Exit codes: 0 success, 2 configuration/arguments, 3 authentication, 4 network,
              5 vault, 6 permissions, 7 file I/O, 8 dependencies, 130 cancelled.`;

const setupHelpPt = `Configuração do Canvas
  node scripts/setup.mjs [configure] [--lang pt-BR|en]
  node scripts/setup.mjs configure --non-interactive [--base-url <URL>] [--replace]
  node scripts/setup.mjs doctor [--json] [--lang pt-BR|en]
  node scripts/setup.mjs remove [--yes] [--lang pt-BR|en]
  Automação: forneça CANVAS_API_TOKEN pelo ambiente, nunca por argumento.
  Para substituir credenciais existentes automaticamente, use --replace.
  remove exclui apenas a entrada do cofre; variáveis de ambiente são preservadas.
  Códigos: 0 sucesso, 2 configuração/argumentos, 3 autenticação, 4 rede,
           5 cofre, 6 permissões, 7 arquivos, 8 dependências, 130 cancelado.`;

export async function configure(options, deps) {
  const { env, readUser, vaultFactory, clientFactory, ask, hidden, log, t } = deps;
  const automatic = Boolean(options['non-interactive']);
  let fromEnvironment;
  let environmentWarning = false;
  if (automatic && options['base-url'] && env.CANVAS_API_TOKEN?.trim()) {
    fromEnvironment = { ...validateCredentials({ baseUrl: options['base-url'], token: env.CANVAS_API_TOKEN }), source: 'environment' };
    environmentWarning = Boolean(env.CANVAS_BASE_URL?.trim() || env.CANVAS_API_TOKEN?.trim());
  } else {
    try { fromEnvironment = await environmentCredentials(env, readUser); }
    catch (error) {
      if (automatic || !['incomplete', 'invalidUrl'].includes(error.key)) throw error;
      log(t[error.key]);
      environmentWarning = true;
    }
  }
  environmentWarning ||= Boolean(fromEnvironment);
  const confirm = async key => /^(y|yes|s|sim)$/i.test((await ask(`${t[key]}${t.yesNo}`)).trim());
  let candidate;
  if (automatic) {
    candidate = validateCredentials({ baseUrl: options['base-url'] ?? fromEnvironment?.baseUrl, token: env.CANVAS_API_TOKEN ?? fromEnvironment?.token });
  } else if (fromEnvironment && await confirm('migrate')) {
    candidate = fromEnvironment;
  } else if (fromEnvironment) {
    const profile = await clientFactory(fromEnvironment).profile();
    log(`${t.connected}: ${cleanDisplay(profile.name)}`);
    log(t.temporary);
    log(t.restart);
    return { source: fromEnvironment.source };
  }
  const vault = await vaultFactory();
  let existing;
  try { existing = await vault.read(); }
  catch (error) {
    if (error.key !== 'invalidVault') throw error;
    existing = true;
    log(t.invalidVault);
  }
  if (existing) {
    if (automatic && !options.replace) throw new CanvasError('usage', 'overwrite');
    if (!automatic && !await confirm('replace')) throw new CanvasError('cancelled');
  }
  if (!candidate) {
    const baseUrl = await ask(`${t.url}: `);
    log(t.tokenGuide);
    candidate = validateCredentials({ baseUrl, token: await hidden(t.token) });
  }
  log(t.validating);
  const profile = await clientFactory(candidate).profile();
  // Validate before changing credentials. Save URL and token together.
  await vault.write({ baseUrl: candidate.baseUrl, token: candidate.token });
  log(`${t.connected}: ${cleanDisplay(profile.name)}`);
  log(t.saved);
  if (environmentWarning) {
    log(t.environmentKept);
    if (!automatic && await confirm('showRemoval')) log(removalCommands());
  }
  log(t.restart);
  return { source: 'vault' };
}

export async function doctor(options, deps) {
  const { env, readUser, vaultFactory, clientFactory, log, write, t, lang } = deps;
  let source;
  try {
    const credentials = await resolveCredentials({ env, readUser, vaultFactory });
    source = credentials.source;
    await clientFactory(credentials).profile();
    if (options.json) write(JSON.stringify({ ok: true, source, environmentOverridesVault: source !== 'vault' }));
    else {
      log(t.diagnosticOk);
      log(`${t.source}: ${source}`);
      if (source !== 'vault') log(t.environmentKept);
    }
    return 0;
  } catch (error) {
    const code = error.exitCode ?? 1;
    if (options.json) write(JSON.stringify({ ok: false, source, error: error.kind ?? 'internal', reason: error.key ?? 'internal', exitCode: code, message: safeError(error, lang) }));
    else log(safeError(error, lang));
    return code;
  }
}

export async function remove(options, deps) {
  const { env, readUser, vaultFactory, ask, log, t } = deps;
  if (!options.yes && !/^(y|yes|s|sim)$/i.test((await ask(`${t.removeQuestion}${t.yesNo}`)).trim())) throw new CanvasError('cancelled');
  log(await (await vaultFactory()).remove() ? t.removed : t.absent);
  const userEnv = await readUser();
  if (env.CANVAS_BASE_URL?.trim() || env.CANVAS_API_TOKEN?.trim() || userEnv.CANVAS_BASE_URL?.trim() || userEnv.CANVAS_API_TOKEN?.trim()) log(t.removeEnv);
  return 0;
}

export async function runSetup(argv, overrides = {}) {
  const { command = 'configure', options } = parseArgs(argv, {
    commands: ['configure', 'doctor', 'remove'],
    values: ['base-url', 'lang'], flags: ['non-interactive', 'replace', 'json', 'yes', 'help'],
  });
  const env = overrides.env ?? process.env;
  const lang = language(options.lang, env);
  const t = messages(lang);
  const deps = {
    env, lang, t, readUser: windowsUserEnvironment, vaultFactory: createVault, clientFactory: createClient,
    ask: question, hidden: hiddenQuestion, log: text => process.stderr.write(`${text}\n`),
    write: text => process.stdout.write(`${text}\n`), boot: bootstrap, ...overrides,
  };
  if (options.help) { deps.write(lang === 'pt-BR' ? setupHelpPt : setupHelp); return 0; }
  if ((command !== 'configure' && (options['base-url'] || options['non-interactive'] || options.replace)) || (options.json && command !== 'doctor') || (options.yes && command !== 'remove') || (options.replace && !options['non-interactive']) || (options['base-url'] && !options['non-interactive'])) throw new CanvasError('usage', 'arguments');
  // doctor is read-only and produces one JSON document, including dependency failures.
  if (command === 'doctor') return doctor(options, deps);
  if (command === 'configure' && !options['non-interactive'] && !overrides.ask && (!process.stdin.isTTY || !process.stderr.isTTY)) throw new CanvasError('usage', 'terminal');
  if (command === 'remove' && !options.yes && !overrides.ask && (!process.stdin.isTTY || !process.stderr.isTTY)) throw new CanvasError('usage', 'terminal');
  await deps.boot({ log: () => deps.log(t.installing) });
  if (command === 'remove') return remove(options, deps);
  if (!options['non-interactive']) deps.log(t.title);
  await configure(options, deps);
  return 0;
}

if (isMain(import.meta.url)) {
  try {
    requireRuntime();
    process.exitCode = await runSetup(process.argv.slice(2));
  } catch (error) {
    const args = process.argv.slice(2);
    const lang = language(args.includes('--lang') ? args[args.indexOf('--lang') + 1] : undefined);
    if (args.includes('doctor') && args.includes('--json')) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: error.kind ?? 'internal', reason: error.key ?? 'internal', exitCode: error.exitCode ?? 1, message: safeError(error, lang) })}\n`);
    } else process.stderr.write(`${safeError(error, lang)}\n`);
    process.exitCode = error.exitCode ?? 1;
  }
}
