import { mkdir, link, rename, unlink, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CanvasError, validateCredentials } from './core.mjs';

export function nextLink(header) {
  for (const part of (header ?? '').split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

function checkStatus(response) {
  if (response.status === 401) throw new CanvasError('authentication');
  if (response.status === 403) throw new CanvasError('access');
  if (!response.ok) throw new CanvasError('network');
}

export function safeFilename(value) {
  let name = String(value ?? 'download').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '');
  if (!name || name === '.' || name === '..') name = 'download';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  return name;
}

export function createClient(credentials, { fetchImpl = fetch } = {}) {
  const { baseUrl, token } = validateCredentials(credentials);
  async function request(url, { download = false } = {}) {
    let target;
    try {
      target = new URL(url, baseUrl);
      if (target.protocol !== 'https:' || target.username || target.password || (!download && target.origin !== baseUrl)) throw new Error();
    } catch { throw new CanvasError('network'); }
    for (let redirects = 0; redirects <= 5; redirects++) {
      const headers = { Accept: download ? '*/*' : 'application/json' };
      if (target.origin === baseUrl) headers.Authorization = `Bearer ${token}`;
      let response;
      try {
        response = await fetchImpl(target.href, { headers, redirect: 'manual', signal: AbortSignal.timeout(30000) });
      } catch { throw new CanvasError('network'); }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        // API redirects are not followed: validate the institution URL instead.
        if (!download || redirects === 5) throw new CanvasError('network');
        try {
          const location = response.headers.get('location');
          if (!location) throw new Error();
          target = new URL(location, target);
          if (target.protocol !== 'https:' || target.username || target.password) throw new Error();
        } catch { throw new CanvasError('network'); }
        continue;
      }
      checkStatus(response);
      return response;
    }
  }

  async function json(url) {
    const response = await request(url);
    try { return await response.json(); } catch { throw new CanvasError('network'); }
  }

  async function paged(url) {
    const items = [];
    const seen = new Set();
    let next = new URL(url, baseUrl).href;
    while (next) {
      if (seen.has(next)) throw new CanvasError('network');
      seen.add(next);
      const response = await request(next);
      let page;
      try { page = await response.json(); } catch { throw new CanvasError('network'); }
      if (!Array.isArray(page)) throw new CanvasError('network');
      items.push(...page);
      next = nextLink(response.headers.get('link'));
    }
    return items;
  }

  return {
    async profile() {
      const profile = await json('/api/v1/users/self/profile');
      if (!profile || profile.id == null || typeof profile.name !== 'string') throw new CanvasError('network');
      return { id: profile.id, name: profile.name, primary_email: profile.primary_email };
    },
    async courses() {
      const items = await paged('/api/v1/courses?enrollment_state=active&state%5B%5D=available&include%5B%5D=term&per_page=100');
      return items.sort((a, b) => String(a.name).localeCompare(String(b.name))).map(item => ({ id: item.id, name: item.name, course_code: item.course_code, term: item.term?.name }));
    },
    async files(courseId) {
      if (!Number.isSafeInteger(courseId) || courseId <= 0) throw new CanvasError('usage', 'arguments');
      const items = await paged(`/api/v1/courses/${courseId}/files?per_page=100`);
      return items.sort((a, b) => String(a.display_name).localeCompare(String(b.display_name))).map(item => ({ id: item.id, name: item.display_name, content_type: item['content-type'], size: item.size, updated_at: item.updated_at, locked: item.locked }));
    },
    async download(fileId, outputPath, { force = false } = {}) {
      if (!Number.isSafeInteger(fileId) || fileId <= 0 || !outputPath) throw new CanvasError('usage', 'arguments');
      const file = await json(`/api/v1/files/${fileId}`);
      let destination = path.resolve(outputPath);
      try {
        const info = await stat(destination);
        if (info.isDirectory()) destination = path.join(destination, safeFilename(file.display_name));
      } catch (error) {
        if (error.code !== 'ENOENT') throw new CanvasError('io');
      }
      try {
        await stat(destination);
        if (!force) throw new CanvasError('io', 'exists');
      } catch (error) {
        if (error instanceof CanvasError) throw error;
        if (error.code !== 'ENOENT') throw new CanvasError('io');
      }
      if (typeof file.url !== 'string') throw new CanvasError('network');
      const response = await request(file.url, { download: true });
      if (!response.body) throw new CanvasError('network');
      const temporary = path.join(path.dirname(destination), `.canvas-${randomUUID()}.tmp`);
      try {
        await mkdir(path.dirname(destination), { recursive: true });
        await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
        // Hard-link publication prevents a concurrent download from overwriting a file.
        if (force) await rename(temporary, destination);
        else await link(temporary, destination);
        const info = await stat(destination);
        return { FullName: destination, Length: info.size, LastWriteTime: info.mtime.toISOString() };
      } catch (error) {
        throw new CanvasError('io', error.code === 'EEXIST' ? 'exists' : 'io');
      } finally {
        await unlink(temporary).catch(() => {});
      }
    },
  };
}
