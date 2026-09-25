import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { digest } from '../canonical.js';
import { validatePack } from '../pack.js';
import { startFixture } from './fixture.js';

function decoded(result) {
  if (result.isError || result.content?.[0]?.type !== 'text') throw new Error('Synthetic MCP tool returned an error or non-text result');
  return JSON.parse(result.content[0].text);
}

/** Executes the support pack against a real local MCP transport, not an external helpdesk. */
export async function runStagingDemo(input) {
  const pack = validatePack(input);
  const fixture = await startFixture(pack);
  let client;
  try {
    client = new Client({ name: 'capabilityops-demo', version: '0.1.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(fixture.url), { requestInit: { headers: { Authorization: `Bearer ${fixture.token}` } } });
    await client.connect(transport);
    const catalog = (await client.listTools()).tools;
    const discovered = new Set(catalog.map(tool => tool.name));
    if (pack.contract.requiredTools.some(name => !discovered.has(name))) throw new Error('Fixture missing a required MCP tool');

    const trace = [];
    const results = [];
    for (const item of pack.cases) {
      const before = decoded(await client.callTool({ name: 'get_ticket', arguments: { ticket: item.ticket } }));
      trace.push({ case: item.id, step: 'read', status: before.status });
      const qualityPass = item.proposal === item.referenceResolution;
      trace.push({ case: item.id, step: 'fixture_quality', passed: qualityPass });
      trace.push({ case: item.id, step: 'fixture_approval', approved: item.humanApproved });
      let closed = false;
      let replayConverged = null;
      let effectId = null;
      if (qualityPass && item.humanApproved) {
        const arguments_ = { ticket: item.ticket, resolution: item.proposal, idempotencyKey: digest({ pack: pack.id, version: pack.version, ticket: item.ticket }) };
        const first = decoded(await client.callTool({ name: 'close_ticket', arguments: arguments_ }));
        const replay = decoded(await client.callTool({ name: 'close_ticket', arguments: arguments_ }));
        const after = decoded(await client.callTool({ name: 'get_ticket', arguments: { ticket: item.ticket } }));
        closed = first.status === 'closed' && after.status === 'closed' && after.resolution === item.proposal;
        replayConverged = first.effectId === replay.effectId;
        effectId = first.effectId;
        trace.push({ case: item.id, step: 'fixture_effect', status: after.status, replayConverged });
      }
      const outcome = !qualityPass ? 'rejected' : !item.humanApproved ? 'held_for_approval' : item.reviewerAccepted && closed ? 'accepted' : 'closed_not_accepted';
      trace.push({ case: item.id, step: 'fixture_acceptance', accepted: outcome === 'accepted' });
      results.push({ id: item.id, ticket: item.ticket, outcome, expectedOutcome: item.expectedOutcome, closed, replayConverged, effectId, totalCostCents: Object.values(item.costCents).reduce((a, b) => a + b, 0) });
    }
    const accepted = results.filter(r => r.outcome === 'accepted').length;
    const totalCostCents = results.reduce((sum, r) => sum + r.totalCostCents, 0);
    const stats = fixture.stats();
    const body = {
      schemaVersion: 1, system: 'CapabilityOps local staging fixture', evidenceClass: 'SYNTHETIC',
      pack: { id: pack.id, version: pack.version, digest: digest(pack) },
      status: results.every(r => r.outcome === r.expectedOutcome && r.replayConverged !== false) && stats.writes === results.filter(r => r.closed).length ? 'pass' : 'fail',
      results, trace,
      metrics: { eligibleCases: results.length, acceptedCases: accepted, totalCostCents, costPerAcceptedCents: accepted ? totalCostCents / accepted : null, syntheticProviderWrites: stats.writes, currency: pack.currency },
      claim: 'Real MCP protocol calls against a loopback synthetic fixture only. No authenticated human review, durable effect store, customer connector, or production authorization.',
    };
    return { ...body, reportDigest: digest(body) };
  } finally {
    try { if (client) await client.close(); }
    finally { await fixture.close(); }
  }
}
