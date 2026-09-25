import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importTicketExport } from '../src/ops/intake.js';
import { reviewQueue } from '../src/ops/review.js';
import { runStagingDemo } from '../src/ops/staging.js';

const read = async file => JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'));

test('metadata-only intake and digest-bound local review preserve the approval boundary', async () => {
  const export_ = await read('../examples/ticket-export.json');
  const queue = importTicketExport(export_);
  assert.equal(queue.count, 2);
  assert.equal(queue.mode, 'READ_ONLY');
  const decision = { schemaVersion: 1, queueDigest: queue.reportDigest, decisions: [{ ticketId: queue.tickets[0].id, reviewer: 'local.reviewer', decision: 'approve' }] };
  const reviewed = reviewQueue(queue, decision);
  assert.deepEqual(reviewed.counts, { pending: 1, approved: 1, rejected: 0 });
  assert.equal(reviewed.mode, 'LOCAL_REVIEW_ONLY');
  assert.match(reviewed.claim, /cannot authorize provider writes/);
  assert.throws(() => importTicketExport({ ...export_, tickets: [{ ...export_.tickets[0], email: 'person@example.com' }] }), /unique id/);
  assert.throws(() => importTicketExport({ ...export_, tickets: [export_.tickets[0], export_.tickets[0]] }), /unique id/);
  assert.throws(() => reviewQueue({ ...queue, count: 999 }, decision), /valid intake queue digest/);
  assert.throws(() => reviewQueue(queue, { ...decision, queueDigest: 'wrong' }), /valid intake queue digest/);
  assert.throws(() => reviewQueue(queue, { ...decision, decisions: [...decision.decisions, ...decision.decisions] }), /unique known ticket/);
});

test('staging MCP transport enforces approval, acceptance, and replay convergence', async () => {
  const report = await runStagingDemo(await read('../packs/support-resolution/pack.json'));
  assert.equal(report.status, 'pass');
  assert.equal(report.evidenceClass, 'SYNTHETIC');
  assert.deepEqual(report.results.map(result => result.outcome), ['accepted', 'rejected', 'held_for_approval', 'closed_not_accepted']);
  assert.equal(report.metrics.syntheticProviderWrites, 2);
  assert.equal(report.metrics.acceptedCases, 1);
  assert.equal(report.metrics.totalCostCents, 210);
  assert.ok(report.results.filter(result => result.closed).every(result => result.replayConverged));
});
