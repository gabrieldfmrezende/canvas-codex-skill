import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CanvasError, bootstrap, environmentCredentials, normalizeBaseUrl, resolveCredentials, root } from '../scripts/lib/core.mjs';
import { language, safeError } from '../scripts/lib/messages.mjs';
import { hiddenQuestion } from '../scripts/lib/terminal.mjs';
import { runSetup } from '../scripts/setup.mjs';

const secret = 'dummy-test-token-do-not-print';
const credentials = { baseUrl: 'https://canvas.example', token: secret };

function harness({ saved = null, env = {}, answers = [], profileError, vaultError, writeError } = {}) {
  const logs = [];
  const output = [];
  const events = [];
  const vault = {
    read: async () => saved,
    write: async value => { events.push('save'); if (writeError) throw writeError; saved = value; },
    remove: async () => { events.push('remove'); const existed = Boolean(saved); saved = null; return existed; },
  };
  return {
    logs, output, events, saved: () => saved,
    deps: {
      env, readUser: async () => ({}), boot: async () => events.push('boot'),
      vaultFactory: async () => { if (vaultError) throw vaultError; return vault; },
      clientFactory: input => ({ profile: async () => {
        assert.equal(input.token, secret);
        events.push('validate');
        if (profileError) throw profileError;
        return { id: 1, name: 'Test User' };
      } }),
      ask: async () => { if (!answers.length) throw new Error('Unexpected prompt'); return answers.shift(); },
      hidden: async () => secret,
      log: text => logs.push(text), write: text => output.push(text),
    },
  };
}

test('normalize institution and course URLs, reject insecure/credential URLs', () => {
  assert.equal(normalizeBaseUrl(' https://canvas.example/courses/42?tab=files#x '), credentials.baseUrl);
  for (const value of ['http://canvas.example', 'https://user:password@canvas.example', 'not a URL']) assert.throws(() => normalizeBaseUrl(value), { key: 'invalidUrl' });
});

test('environment is a complete pair and never mixes sources', async () => {
  let reads = 0;
  const options = { env: { CANVAS_BASE_URL: credentials.baseUrl, CANVAS_API_TOKEN: secret }, readUser: async () => { throw new Error('Must not read'); }, vaultFactory: async () => { reads++; } };
  assert.equal((await resolveCredentials(options)).source, 'environment');
  assert.equal(reads, 0);
  for (const env of [{ CANVAS_BASE_URL: credentials.baseUrl }, { CANVAS_API_TOKEN: secret }]) {
    await assert.rejects(resolveCredentials({ ...options, env }), { key: 'incomplete' });
  }
});

test('legacy Windows pair is read without mixing process and persistent values', async () => {
  const readUser = async () => ({ CANVAS_BASE_URL: credentials.baseUrl, CANVAS_API_TOKEN: secret });
  assert.equal((await environmentCredentials({}, readUser)).source, 'windows-user-environment');
  await assert.rejects(environmentCredentials({ CANVAS_BASE_URL: credentials.baseUrl }, readUser), { key: 'incomplete' });
});

test('empty environment resolves vault, absence and vault errors remain distinct', async () => {
  const base = { env: {}, readUser: async () => ({}) };
  assert.equal((await resolveCredentials({ ...base, vaultFactory: async () => ({ read: async () => credentials }) })).source, 'vault');
  await assert.rejects(resolveCredentials({ ...base, vaultFactory: async () => ({ read: async () => null }) }), { key: 'missing' });
  await assert.rejects(resolveCredentials({ ...base, vaultFactory: async () => { throw new CanvasError('vault'); } }), { kind: 'vault' });
});

test('interactive setup validates before saving, without printing token', async () => {
  const h = harness({ answers: ['https://canvas.example/courses/42'] });
  assert.equal(await runSetup(['--lang', 'pt-BR'], h.deps), 0);
  assert.deepEqual(h.events, ['boot', 'validate', 'save']);
  assert.deepEqual(h.saved(), credentials);
  assert.ok(h.logs.some(line => line.includes('salvas')));
  assert.ok(!h.logs.join('\n').includes(secret));
});

test('authentication, permission and network failures preserve old credentials', async () => {
  for (const kind of ['authentication', 'access', 'network']) {
    const original = { baseUrl: 'https://old.example', token: 'old-dummy-token' };
    const h = harness({ saved: original, answers: ['yes', credentials.baseUrl], profileError: new CanvasError(kind) });
    await assert.rejects(runSetup([], h.deps), { kind });
    assert.equal(h.saved(), original);
    assert.deepEqual(h.events, ['boot', 'validate']);
  }
});

test('cancelled replacement leaves credentials intact and never prompts for token', async () => {
  const h = harness({ saved: credentials, answers: ['no'] });
  h.deps.hidden = async () => { throw new Error('Must not prompt'); };
  await assert.rejects(runSetup([], h.deps), { exitCode: 130 });
  assert.equal(h.saved(), credentials);
  assert.deepEqual(h.events, ['boot']);
});

test('vault write failure leaves the previous saved connection intact', async () => {
  const original = { baseUrl: 'https://old.example', token: 'old-dummy-token' };
  const h = harness({ saved: original, answers: ['yes', credentials.baseUrl], writeError: new CanvasError('vault') });
  await assert.rejects(runSetup([], h.deps), { kind: 'vault' });
  assert.equal(h.saved(), original);
});

test('interactive repair handles incomplete or malformed environment settings', async () => {
  for (const env of [{ CANVAS_BASE_URL: credentials.baseUrl }, { CANVAS_BASE_URL: 'not-a-url', CANVAS_API_TOKEN: secret }]) {
    const h = harness({ env, answers: [credentials.baseUrl, 'no'] });
    await runSetup([], h.deps);
    assert.deepEqual(h.saved(), credentials);
    assert.equal(env.CANVAS_BASE_URL === 'not-a-url' ? env.CANVAS_BASE_URL : env.CANVAS_API_TOKEN, env.CANVAS_BASE_URL === 'not-a-url' ? 'not-a-url' : undefined);
  }
});

test('migration preserves environment and diagnoses its override', async () => {
  const env = { CANVAS_BASE_URL: credentials.baseUrl, CANVAS_API_TOKEN: secret, LANG: 'en' };
  const h = harness({ env, answers: ['yes', 'no'] });
  await runSetup([], h.deps);
  assert.deepEqual(h.saved(), credentials);
  assert.equal(env.CANVAS_API_TOKEN, secret);
  assert.ok(h.logs.some(line => line.includes('still override')));
  await runSetup(['doctor', '--json'], h.deps);
  assert.deepEqual(JSON.parse(h.output[0]), { ok: true, source: 'environment', environmentOverridesVault: true });
  assert.ok(![...h.logs, ...h.output].join('\n').includes(secret));
});

test('declining migration permits temporary use without a vault', async () => {
  const h = harness({ env: { CANVAS_BASE_URL: credentials.baseUrl, CANVAS_API_TOKEN: secret }, answers: ['no'], vaultError: new CanvasError('vault') });
  await runSetup([], h.deps);
  assert.equal(h.saved(), null);
  assert.deepEqual(h.events, ['boot', 'validate']);
});

test('automation accepts URL argument and environment token without questions', async () => {
  const h = harness({ env: { CANVAS_API_TOKEN: secret } });
  await runSetup(['configure', '--non-interactive', '--base-url', `${credentials.baseUrl}/courses/1`], h.deps);
  assert.deepEqual(h.saved(), credentials);
  const existing = harness({ saved: credentials, env: { CANVAS_BASE_URL: credentials.baseUrl, CANVAS_API_TOKEN: secret } });
  await assert.rejects(runSetup(['configure', '--non-interactive'], existing.deps), { key: 'overwrite' });
  await runSetup(['configure', '--non-interactive', '--replace'], existing.deps);
});

test('doctor JSON stays read-only, produces one document and sanitized failures', async () => {
  for (const kind of ['authentication', 'network', 'vault']) {
    const h = harness(kind === 'vault' ? { vaultError: new CanvasError(kind) } : { saved: credentials, profileError: new CanvasError(kind) });
    const code = await runSetup(['doctor', '--json', '--lang', 'en'], h.deps);
    const result = JSON.parse(h.output[0]);
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, code);
    assert.equal(result.error, kind);
    assert.equal(h.output.length, 1);
    assert.equal(h.logs.length, 0);
    assert.ok(!h.events.includes('boot'));
    assert.ok(!h.events.includes('save'));
    assert.ok(!h.output[0].includes(secret));
  }
  assert.ok(!safeError(new Error(secret), 'en').includes(secret));
});

test('removal needs confirmation, only removes vault, warns of environment', async () => {
  const env = { CANVAS_API_TOKEN: secret };
  const h = harness({ saved: credentials, env });
  await runSetup(['remove', '--yes', '--lang', 'en'], h.deps);
  assert.equal(h.saved(), null);
  assert.equal(env.CANVAS_API_TOKEN, secret);
  assert.ok(h.logs.some(line => line.includes('only the vault')));
});

test('bootstrap uses fixed cwd and removes token from npm environment', async () => {
  for (const platform of ['win32', 'linux', 'darwin']) {
    let loaded = false;
    await bootstrap({
      platform, env: { PATH: 'example', CANVAS_API_TOKEN: secret },
      load: async () => { if (!loaded) throw new Error(); },
      run: async (file, args, options) => {
        assert.equal(options.env.CANVAS_API_TOKEN, undefined);
        assert.equal(options.cwd, root);
        assert.ok(args.join(' ').includes('--ignore-scripts'));
        assert.equal(file, platform === 'win32' ? 'cmd.exe' : 'npm');
        loaded = true;
      },
    });
  }
  await assert.rejects(bootstrap({ load: async () => { throw new Error(secret); }, run: async () => { throw new Error(secret); } }), { exitCode: 8 });
});

test('language detection and explicit choice', () => {
  assert.equal(language(undefined, { LANG: 'pt_BR.UTF-8' }), 'pt-BR');
  assert.equal(language('en', { LANG: 'pt_BR.UTF-8' }), 'en');
  assert.equal(language(undefined, { LANG: 'de_DE.UTF-8' }), 'en');
});

test('hidden prompt never echoes paste and restores raw mode on completion and Ctrl+C', async () => {
  for (const cancel of [false, true]) {
    const input = new EventEmitter();
    input.isTTY = true;
    input.isRaw = false;
    input.isPaused = () => true;
    input.setRawMode = value => { input.isRaw = value; };
    input.pause = () => {};
    input.resume = () => {};
    const output = { isTTY: true, value: '', write(value) { this.value += value; } };
    const pending = hiddenQuestion('Hidden token', { input, output });
    input.emit('keypress', secret, {});
    if (cancel) {
      input.emit('keypress', '\x03', { ctrl: true, name: 'c' });
      await assert.rejects(pending, { exitCode: 130 });
    } else {
      input.emit('keypress', '\r', { name: 'return' });
      assert.equal(await pending, secret);
    }
    assert.equal(input.isRaw, false);
    assert.ok(!output.value.includes(secret));
    assert.equal(input.listenerCount('keypress'), 0);
  }
});

test('token arguments and irrelevant flags are rejected without echoing them', async () => {
  const h = harness();
  for (const args of [['configure', '--token', secret], ['remove', '--json'], ['doctor', '--replace']]) {
    await assert.rejects(runSetup(args, h.deps), { key: 'arguments' });
  }
});
