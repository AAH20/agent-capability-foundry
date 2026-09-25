import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { catalog, loadCapability, runCapability } from './catalog.js';

const html = fileURLToPath(new URL('./studio.html', import.meta.url));
const js = fileURLToPath(new URL('./studio.js', import.meta.url));
const MAX_BODY = 1024;

function reply(res, status, data, type = 'application/json; charset=utf-8') {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': type.startsWith('text/html') ? "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'" : "default-src 'none'" });
  res.end(body);
}

export function createStudioServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/') return reply(res, 200, await readFile(html, 'utf8'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/studio.js') return reply(res, 200, await readFile(js, 'utf8'), 'text/javascript; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/api/catalog') return reply(res, 200, { evidenceClass: 'SYNTHETIC', capabilities: await catalog() });
      if (req.method === 'GET' && url.pathname.startsWith('/api/pack/')) {
        const id = url.pathname.slice('/api/pack/'.length);
        if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) return reply(res, 404, { error: 'not found' });
        return reply(res, 200, (await loadCapability(id)).pack);
      }
      if (req.method === 'POST' && url.pathname === '/api/run') {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return reply(res, 403, { error: 'cross-origin request rejected' });
        const length = Number(req.headers['content-length']);
        if (!Number.isSafeInteger(length) || length < 1 || length > MAX_BODY) return reply(res, 413, { error: 'invalid request length' });
        const raw = await new Promise((resolve, reject) => { let body = ''; req.on('data', chunk => { body += chunk; if (body.length > MAX_BODY) reject(new Error('request too large')); }); req.on('end', () => resolve(body)); req.on('error', reject); });
        const input = JSON.parse(raw);
        if (!input || Object.keys(input).join(',') !== 'id' || typeof input.id !== 'string') return reply(res, 400, { error: 'id required' });
        const { pack } = await loadCapability(input.id);
        return reply(res, 200, runCapability(pack));
      }
      return reply(res, 404, { error: 'not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unexpected error';
      return reply(res, /Unknown capability|not found/i.test(message) ? 404 : 400, { error: message });
    }
  });
}

export async function startStudio(port = 4327) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be 1..65535');
  const server = createStudioServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}
