import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runPack, verifyReport } from '../src/run.js';
import { validatePack } from '../src/pack.js';

const pack = JSON.parse(await readFile(new URL('../packs/support-resolution/pack.json', import.meta.url), 'utf8'));

test('synthetic pack resolves and rejects the declared cases', () => {
  const report = runPack(pack);
  assert.equal(report.status, 'pass');
  assert.deepEqual(report.cases.map(c => c.outcome), ['accepted', 'rejected', 'held_for_approval', 'closed_not_accepted']);
  assert.equal(report.metrics.acceptedCases, 1);
  assert.equal(report.metrics.closedCases, 2);
  assert.equal(report.metrics.syntheticEffectAttempts, 4);
  assert.equal(report.metrics.syntheticEffectWrites, 2);
  assert.equal(report.metrics.totalCostCents, 210);
  assert.equal(report.metrics.costPerAcceptedCents, 210);
  assert.equal(verifyReport(pack, report).valid, true);
});

test('tampered report fails independent recalculation', () => {
  const report = runPack(pack);
  report.metrics.acceptedCases = 4;
  assert.equal(verifyReport(pack, report).valid, false);
});

test('pack rejects missing cost category and unapproved closure contract', () => {
  const missingCost = structuredClone(pack);
  delete missingCost.cases[0].costCents.rework;
  assert.throws(() => validatePack(missingCost), /seven cost/);
  const missingApproval = structuredClone(pack);
  missingApproval.contract.humanApprovalRequiredFor = [];
  assert.throws(() => validatePack(missingApproval), /closure approval/);
});
