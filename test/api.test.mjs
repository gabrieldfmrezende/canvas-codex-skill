import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '../scripts/lib/api.mjs';
import { runHelper } from '../scripts/canvas.mjs';

const credentials = { baseUrl: 'https://canvas.example', token: 'dummy-test-secret' };
const json = (value, headers) => new Response(JSON.stringify(value), { headers });

test('profile authenticates on the institution origin only and normalizes output', async () => {
  const client = createClient(credentials, { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://canvas.example/api/v1/users/self/profile');
    assert.equal(options.headers.Authorization, 'Bearer dummy-test-secret');
    assert.equal(options.redirect, 'manual');
    return json({ id: 1, name: 'Student', primary_email: 'student@example.com', private_field: 'ignored' });
  } });
  assert.deepEqual(await client.profile(), { id: 1, name: 'Student', primary_email: 'student@example.com' });
});

test('API failures are classified without forwarding response bodies or native errors', async () => {
  for (const [status, kind] of [[401, 'authentication'], [403, 'access'], [500, 'network']]) {
    const client = createClient(credentials, { fetchImpl: async () => new Response(credentials.token, { status }) });
    await assert.rejects(client.profile(), error => error.kind === kind && !error.message.includes(credentials.token));
  }
  await assert.rejects(createClient(credentials, { fetchImpl: async () => { throw new Error(credentials.token); } }).profile(), { kind: 'network' });
});

test('courses and files follow pagination and preserve public projections', async () => {
  let calls = 0;
  const client = createClient(credentials, { fetchImpl: async url => {
    calls++;
    if (url.includes('/courses?')) return json([{ id: 2, name: 'B', course_code: 'B', term: { name: '2026' } }], { link: '<https://canvas.example/page2>; rel="next"' });
    if (url.endsWith('/page2')) return json([{ id: 1, name: 'A', course_code: 'A' }]);
    return json([{ id: 3, display_name: 'notes.pdf', 'content-type': 'application/pdf', size: 5, locked: false }]);
  } });
  assert.deepEqual((await client.courses()).map(course => course.id), [1, 2]);
  assert.equal((await client.files(1))[0].content_type, 'application/pdf');
  assert.equal(calls, 3);
});

test('pagination cannot leak bearer to another origin or loop forever', async () => {
  for (const next of ['https://attacker.example/page2', 'https://canvas.example/api/v1/courses?enrollment_state=active&state%5B%5D=available&include%5B%5D=term&per_page=100']) {
    let requests = 0;
    const client = createClient(credentials, { fetchImpl: async () => { requests++; return json([], { link: `<${next}>; rel="next"` }); } });
    await assert.rejects(client.courses(), { kind: 'network' });
    assert.equal(requests, 1);
  }
});

test('downloads follow signed redirects without forwarding bearer and preserve existing files', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'canvas-download-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [];
  const client = createClient(credentials, { fetchImpl: async (url, options) => {
    calls.push({ url, authorization: options.headers.Authorization });
    if (url.includes('/api/v1/files/')) return json({ display_name: '../notes.pdf', url: 'https://canvas.example/download/1' });
    if (url.includes('/download/')) return new Response(null, { status: 302, headers: { location: 'https://files.example/signed' } });
    return new Response('downloaded-content');
  } });
  const result = await client.download(1, directory);
  assert.equal(path.dirname(result.FullName), directory);
  assert.equal(await readFile(result.FullName, 'utf8'), 'downloaded-content');
  assert.equal(calls.at(-1).authorization, undefined);
  assert.equal(calls[1].authorization, 'Bearer dummy-test-secret');
  await writeFile(result.FullName, 'preserved');
  await assert.rejects(client.download(1, directory), { key: 'exists' });
  assert.equal(await readFile(result.FullName, 'utf8'), 'preserved');
  await client.download(1, directory, { force: true });
  assert.equal(await readFile(result.FullName, 'utf8'), 'downloaded-content');
  assert.ok(!(await readdir(directory)).some(file => file.endsWith('.tmp')));
});

test('interrupted downloads preserve original files and clean temporary output', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'canvas-interrupted-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = path.join(directory, 'existing.txt');
  await writeFile(destination, 'original');
  const client = createClient(credentials, { fetchImpl: async url => url.includes('/api/')
    ? json({ display_name: 'file.txt', url: 'https://files.example/signed' })
    : new Response(new ReadableStream({ start(controller) { controller.error(new Error('stream disconnected')); } })) });
  await assert.rejects(client.download(1, destination, { force: true }), { kind: 'io' });
  assert.equal(await readFile(destination, 'utf8'), 'original');
  assert.deepEqual(await readdir(directory), ['existing.txt']);
});

test('CLI validates IDs before accessing credentials and handles all actions', async () => {
  const resolve = async () => { throw new Error('Must not read credentials'); };
  for (const argv of [['files'], ['files', '--course-id', '-1'], ['download', '--file-id', '1']]) await assert.rejects(runHelper(argv, { resolve }), { key: 'arguments' });
  for (const argv of [['profile'], ['courses'], ['files', '--course-id', '42'], ['download', '--file-id', '7', '--output-path', 'downloads', '--force']]) {
    const calls = [];
    const client = Object.fromEntries(['profile', 'courses', 'files', 'download'].map(action => [action, async (...args) => { calls.push([action, ...args]); return 'ok'; }]));
    assert.equal(await runHelper(argv, { resolve: async () => credentials, clientFactory: () => client }), 'ok');
    assert.equal(calls[0][0], argv[0]);
    if (argv[0] === 'download') assert.deepEqual(calls[0], ['download', 7, 'downloads', { force: true }]);
  }
});
