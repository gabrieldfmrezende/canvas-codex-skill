import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { root } from '../scripts/lib/core.mjs';

test('native vault persists an isolated dummy entry across processes', { skip: process.env.CANVAS_TEST_VAULT !== '1' && 'Opt in with CANVAS_TEST_VAULT=1; requires an unlocked OS vault' }, async () => {
  const { AsyncEntry } = await import('@napi-rs/keyring');
  const account = randomUUID();
  const entry = new AsyncEntry('canvas-agent-skill-tests', account, { linux: { store: 'secret-service' } });
  try {
    assert.ok((await entry.getPassword()) == null);
    await entry.setPassword('isolated-dummy-value');
    const code = `const {AsyncEntry}=await import('@napi-rs/keyring'); const e=new AsyncEntry('canvas-agent-skill-tests',process.env.CANVAS_TEST_ACCOUNT,{linux:{store:'secret-service'}}); process.stdout.write((await e.getPassword())==='isolated-dummy-value'?'ok':'failed');`;
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', code], { cwd: root, env: { ...process.env, CANVAS_TEST_ACCOUNT: account }, windowsHide: true });
    assert.equal(stdout, 'ok');
    assert.equal(await entry.deleteCredential(), true);
    assert.ok((await entry.getPassword()) == null);
  } finally {
    await entry.deleteCredential();
  }
});
