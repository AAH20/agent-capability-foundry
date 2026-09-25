import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runPack } from '../src/run.js';
import { assessCandidate } from '../src/gate.js';

const pack = JSON.parse(await readFile(new URL('../packs/support-resolution/pack.json', import.meta.url), 'utf8'));
const redteamIds = ['tool-description-stability', 'unannotated-destructive-tools', 'unauthenticated-tool-exposure', 'token-audience-validation', 'tools-call-authorization-bypass'];
const effectIds = ['concurrent_duplicate_suppression', 'applied_then_timeout_reconciliation', 'crash_after_apply_before_checkpoint', 'preexisting_effect_reconciliation', 'unverified_ambiguous_halt', 'declared_compensation', 'stale_worker_fenced_after_reclaim', 'distinct_invocations_same_effect'];
const compat = { schemaVersion: 1, status: 'pass', results: [{ connectivity: 'pass', authProbe: 'pass', errors: [], tools: ['get_ticket', 'close_ticket'] }] };
const redteam = redteamIds.map(scenario => ({ scenario, findings: [] }));
const effects = { schemaVersion: '1.1.0', summary: { total: 8, failed: 0 }, scenarios: effectIds.map(id => ({ id, passed: true })) };

test('passing artifacts create only an unbound candidate, never production approval', () => {
  const gate = assessCandidate(pack, runPack(pack), compat, redteam, effects);
  assert.equal(gate.status, 'candidate');
  assert.equal(gate.productionEligible, false);
  assert.equal(gate.checks.length, 4);
});

test('missing tool and high-severity finding block candidate', () => {
  const badCompat = structuredClone(compat);
  badCompat.results[0].tools = ['get_ticket'];
  const badRedteam = structuredClone(redteam);
  badRedteam[0].findings.push({ severity: 'high' });
  const gate = assessCandidate(pack, runPack(pack), badCompat, badRedteam, effects);
  assert.equal(gate.status, 'blocked');
  assert.deepEqual(gate.checks.map(c => c.passed), [true, false, false, true]);
});
