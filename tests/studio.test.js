import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalog, loadCapability, runCapability, forkCapability } from '../src/studio/catalog.js';
import { createStudioServer } from '../src/studio/server.js';

const invoice = JSON.parse(await readFile(new URL('../packs/invoice-routing/pack.json', import.meta.url), 'utf8'));

test('Studio catalog runs two distinct synthetic business workflows', async () => {
  const entries = await catalog();
  assert.deepEqual(entries.map(entry => entry.id), ['support-resolution', 'invoice-routing']);
  const support = runCapability((await loadCapability('support-resolution')).pack);
  const routed = runCapability((await loadCapability('invoice-routing')).pack);
  assert.equal(support.status, 'pass');
  assert.equal(routed.status, 'pass');
  assert.deepEqual(routed.cases.map(item => item.outcome), ['accepted', 'rejected', 'held_for_approval', 'routed_not_accepted']);
  assert.equal(routed.metrics.acceptedCases, 1);
  assert.equal(routed.metrics.syntheticEffectWrites, 2);
  assert.equal(routed.metrics.syntheticEffectAttempts, 4);
  assert.equal(routed.metrics.totalCostCents, 180);
  assert.match(routed.claim, /No supplier data/);
});

test('forked packs get distinct identities and reject broken review contracts', () => {
  const fork = forkCapability(invoice, 'my-invoice-routing');
  assert.equal(fork.id, 'my-invoice-routing');
  assert.equal(invoice.id, 'invoice-routing');
  assert.equal(runCapability(fork).status, 'pass');
  assert.notEqual(runCapability(fork).pack.digest, runCapability(invoice).pack.digest);
  assert.throws(() => forkCapability(invoice, '../escape'), /safe lowercase slug/);
  const broken = structuredClone(invoice);
  broken.contract.humanApprovalRequiredFor = [];
  assert.throws(() => runCapability(broken), /approved write tools/);
  assert.throws(() => runCapability({ ...invoice, kind: 'arbitrary-module' }), /Unsupported capability kind/);
});

test('Studio HTTP exposes only allowlisted synthetic packs and runs', async t => {
  const server = createStudioServer();
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); }
  catch (error) { if (error.code === 'EPERM') return t.skip('loopback sockets unavailable in sandbox'); throw error; }
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Agent Capability Studio/);
    const script = await fetch(`${base}/studio.js`);
    assert.equal(script.status, 200);
    const run = await fetch(`${base}/api/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'invoice-routing' }) });
    assert.equal((await run.json()).status, 'pass');
    const missing = await fetch(`${base}/api/pack/not-in-catalog`);
    assert.equal(missing.status, 404);
    const rejected = await fetch(`${base}/api/run`, { method: 'POST', headers: { Origin: 'https://outside.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'support-resolution' }) });
    assert.equal(rejected.status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
