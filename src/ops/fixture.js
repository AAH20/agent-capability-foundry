import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const TOKEN = 'capabilityops-local-fixture';

/** Synthetic staging-only MCP provider. Binds loopback and never reaches a customer system. */
export async function startFixture(pack) {
  const tickets = new Map(pack.cases.map(item => [item.ticket, { id: item.ticket, status: 'open', resolution: null }]));
  const effects = new Map();
  let writes = 0;

  function makeMcp() {
    const mcp = new McpServer({ name: 'capabilityops-synthetic', version: '0.1.0' });
    mcp.registerTool('get_ticket', {
      description: 'Read one synthetic ticket by ID', inputSchema: { ticket: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false },
    }, async ({ ticket }) => {
      const found = tickets.get(ticket);
      if (!found) return { isError: true, content: [{ type: 'text', text: 'unknown ticket' }] };
      return { content: [{ type: 'text', text: JSON.stringify(found) }] };
    });
    mcp.registerTool('close_ticket', {
      description: 'Close one synthetic ticket using a stable idempotency key',
      inputSchema: { ticket: z.string(), resolution: z.string(), idempotencyKey: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    }, async ({ ticket, resolution, idempotencyKey }) => {
      const found = tickets.get(ticket);
      if (!found) return { isError: true, content: [{ type: 'text', text: 'unknown ticket' }] };
      const prior = effects.get(idempotencyKey);
      if (prior) {
        if (prior.ticket !== ticket || prior.resolution !== resolution) return { isError: true, content: [{ type: 'text', text: 'idempotency key reused for different input' }] };
        return { content: [{ type: 'text', text: JSON.stringify(prior) }] };
      }
      if (found.status !== 'open') return { isError: true, content: [{ type: 'text', text: 'ticket is not open' }] };
      const result = { ticket, resolution, status: 'closed', effectId: `fixture-${ticket}` };
      found.status = 'closed'; found.resolution = resolution;
      effects.set(idempotencyKey, result); writes++;
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    });
    return mcp;
  }

  const server = http.createServer(async (req, res) => {
    if (req.url !== '/mcp' || req.method !== 'POST') { res.writeHead(404).end(); return; }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401).end('unauthorized'); return; }
    let raw = '';
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 1024 * 1024) { res.writeHead(413).end(); return; }
      }
      const body = JSON.parse(raw);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { void transport.close(); });
      await makeMcp().connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) res.writeHead(400).end('bad request');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}/mcp`, token: TOKEN,
    stats: () => ({ writes, effects: effects.size }),
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}
