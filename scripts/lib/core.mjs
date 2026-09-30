import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const EXIT = { usage: 2, authentication: 3, network: 4, vault: 5, access: 6, io: 7, dependency: 8, cancelled: 130 };

export class CanvasError extends Error {
  constructor(kind, key = kind) {
    super(key);
    this.kind = kind;
    this.key = key;
    this.exitCode = EXIT[kind] ?? 1;
  }
}

export function requireRuntime() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 20)) throw new CanvasError('dependency', 'runtime');
}

export function normalizeBaseUrl(value) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    return url.origin;
  } catch {
    throw new CanvasError('usage', 'invalidUrl');
  }
}

export function validateCredentials(value) {
  if (!value || typeof value.baseUrl !== 'string' || !value.baseUrl.trim() || typeof value.token !== 'string' || !value.token.trim() || /[\r\n]/.test(value.token)) {
    throw new CanvasError('usage', 'incomplete');
  }
  return { baseUrl: normalizeBaseUrl(value.baseUrl), token: value.token.trim() };
}

// Only fixed keys are read. Never forward this subprocess output to the terminal.
export async function windowsUserEnvironment(platform = process.platform) {
  if (platform !== 'win32') return {};
  const script = "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); @{ CANVAS_BASE_URL = [Environment]::GetEnvironmentVariable('CANVAS_BASE_URL', 'User'); CANVAS_API_TOKEN = [Environment]::GetEnvironmentVariable('CANVAS_API_TOKEN', 'User') } | ConvertTo-Json -Compress";
  try {
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10000 });
    return JSON.parse(stdout.replace(/^\uFEFF/, ''));
  } catch {
    throw new CanvasError('usage', 'legacyEnvironment');
  }
}

export async function environmentCredentials(env = process.env, readUser = windowsUserEnvironment) {
  let values = env;
  let source = 'environment';
  if (!env.CANVAS_BASE_URL?.trim() && !env.CANVAS_API_TOKEN?.trim()) {
    values = await readUser();
    source = 'windows-user-environment';
  }
  const url = values.CANVAS_BASE_URL?.trim();
  const token = values.CANVAS_API_TOKEN?.trim();
  if (!url && !token) return null;
  return { ...validateCredentials({ baseUrl: url, token }), source };
}

export async function createVault() {
  try {
    const { AsyncEntry } = await import('@napi-rs/keyring');
    const entry = new AsyncEntry('canvas-codex-skill', 'default', { linux: { store: 'secret-service' } });
    return {
      async read() {
        let password;
        try { password = await entry.getPassword(); } catch { throw new CanvasError('vault'); }
        if (password == null) return null;
        try { return validateCredentials(JSON.parse(password)); } catch { throw new CanvasError('vault', 'invalidVault'); }
      },
      async write(credentials) {
        try { await entry.setPassword(JSON.stringify(validateCredentials(credentials))); } catch { throw new CanvasError('vault'); }
      },
      async remove() {
        try { return await entry.deleteCredential(); } catch { throw new CanvasError('vault'); }
      },
    };
  } catch (error) {
    if (error instanceof CanvasError) throw error;
    if (error.code === 'ERR_MODULE_NOT_FOUND') throw new CanvasError('dependency');
    throw new CanvasError('vault');
  }
}

export async function resolveCredentials({ env = process.env, readUser = windowsUserEnvironment, vaultFactory = createVault } = {}) {
  const credentials = await environmentCredentials(env, readUser);
  if (credentials) return credentials;
  const saved = await (await vaultFactory()).read();
  if (!saved) throw new CanvasError('usage', 'missing');
  return { ...saved, source: 'vault' };
}

export async function bootstrap({ log = () => {}, run = promisify(execFile), load = () => import('@napi-rs/keyring'), env = process.env, platform = process.platform } = {}) {
  try { await load(); return; } catch { /* Install only the pinned dependencies of this skill. */ }
  log();
  const childEnv = { ...env };
  delete childEnv.CANVAS_API_TOKEN;
  try {
    const args = ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'];
    if (platform === 'win32') {
      // npm.cmd cannot be passed directly to execFile on Windows. This command is constant.
      await run('cmd.exe', ['/d', '/s', '/c', 'npm.cmd ci --omit=dev --ignore-scripts --no-audit --no-fund'], { cwd: root, env: childEnv, windowsHide: true, timeout: 180000 });
    } else {
      await run('npm', args, { cwd: root, env: childEnv, timeout: 180000 });
    }
    await load();
  } catch {
    throw new CanvasError('dependency', 'bootstrapFailed');
  }
}

export function parseArgs(argv, { commands, values = [], flags = [] }) {
  const options = {};
  let command;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      if (command || !commands.includes(arg)) throw new CanvasError('usage', 'arguments');
      command = arg;
    } else {
      const key = arg.slice(2);
      if (Object.hasOwn(options, key)) throw new CanvasError('usage', 'arguments');
      if (values.includes(key)) {
        if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new CanvasError('usage', 'arguments');
        options[key] = argv[++i];
      } else if (flags.includes(key)) {
        options[key] = true;
      } else {
        throw new CanvasError('usage', 'arguments');
      }
    }
  }
  if (options.lang && !['en', 'pt-BR'].includes(options.lang)) throw new CanvasError('usage', 'arguments');
  return { command, options };
}

export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}
