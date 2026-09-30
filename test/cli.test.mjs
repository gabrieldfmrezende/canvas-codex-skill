import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { root } from '../scripts/lib/core.mjs';

const execute = promisify(execFile);
const environment = { ...process.env, LANG: 'en', CANVAS_BASE_URL: 'https://canvas.example', CANVAS_API_TOKEN: 'cli-dummy-secret' };

test('real CLI rejects token argument without displaying it', async () => {
  try {
    await execute(process.execPath, [path.join(root, 'scripts/setup.mjs'), 'configure', '--token', 'never-display-me'], { env: environment });
    assert.fail('Expected failure');
  } catch (error) {
    assert.equal(error.code, 2);
    assert.ok(!error.stdout.includes('never-display-me'));
    assert.ok(!error.stderr.includes('never-display-me'));
  }
});

test('real doctor produces JSON and refuses a partial environment', async () => {
  try {
    await execute(process.execPath, [path.join(root, 'scripts/setup.mjs'), 'doctor', '--json'], { env: { ...environment, CANVAS_BASE_URL: '' } });
    assert.fail('Expected failure');
  } catch (error) {
    assert.equal(error.code, 2);
    const diagnostic = JSON.parse(error.stdout);
    assert.equal(diagnostic.reason, 'incomplete');
    assert.equal(error.stderr, '');
    assert.ok(!error.stdout.includes(environment.CANVAS_API_TOKEN));
  }
});

test('PowerShell adapter preserves all actions, output objects and failure codes', async t => {
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  try { await execute(shell, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']); }
  catch (error) { if (error.code === 'ENOENT') return t.skip('PowerShell is not installed'); throw error; }
  const directory = await mkdtemp(path.join(tmpdir(), 'canvas-adapter-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const stub = path.join(directory, 'fetch.mjs');
  await writeFile(stub, `
globalThis.fetch = async function(url) {
  if (process.env.CANVAS_TEST_FAIL) return new Response('ignored', { status: 401 });
  if (url.includes('/profile')) return Response.json({ id: 1, name: 'Estudante José', primary_email: 'test@example.com' });
  if (url.includes('/courses?')) return Response.json([{ id: 42, name: 'Course', course_code: 'C' }]);
  if (url.includes('/courses/42/files')) return Response.json([{ id: 7, display_name: 'notes.txt', size: 5 }]);
  if (url.includes('/api/v1/files/7')) return Response.json({ display_name: 'notes.txt', url: 'https://files.example/signed' });
  return new Response('test-content');
};
`);
  const env = { ...environment, NODE_OPTIONS: `--import=${pathToFileURL(stub).href}` };
  const helper = path.join(root, 'scripts/canvas.ps1').replaceAll("'", "''");
  const command = args => `& '${helper}' ${args} | ConvertTo-Json -Compress`;
  const profile = await execute(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command('-Action profile')], { env });
  assert.equal(JSON.parse(profile.stdout).name, 'Estudante José');
  const courses = await execute(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command('-Action courses')], { env });
  assert.equal(JSON.parse(courses.stdout).id, 42);
  const files = await execute(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command('-Action files -CourseId 42')], { env });
  assert.equal(JSON.parse(files.stdout).id, 7);
  const destination = path.join(directory, 'file with spaces.txt').replaceAll("'", "''");
  await execute(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command(`-Action download -FileId 7 -OutputPath '${destination}'`)], { env });
  assert.equal(await readFile(destination, 'utf8'), 'test-content');
  await execute(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command(`-Action download -FileId 7 -OutputPath '${destination}' -Force`)], { env });
  try {
    await execute(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/canvas.ps1'), '-Action', 'profile'], { env: { ...env, CANVAS_TEST_FAIL: '1' } });
    assert.fail('Expected failure');
  } catch (error) {
    assert.equal(error.code, 3);
    assert.ok(!error.stderr.includes(environment.CANVAS_API_TOKEN));
  }
});
