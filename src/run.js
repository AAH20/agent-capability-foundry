import { digest } from './canonical.js';
import { validatePack } from './pack.js';

class SyntheticTicketProvider {
  constructor() { this.effects = new Map(); this.writes = 0; }
  close(ticket, resolution, key) {
    if (this.effects.has(key)) return this.effects.get(key);
    const result = { ticket, resolution, status: 'closed', effectId: `synthetic-${ticket}` };
    this.effects.set(key, result);
    this.writes++;
    return result;
  }
}

function evaluateCase(pack, item, provider) {
  const qualityPass = item.proposal === item.referenceResolution;
  const key = digest({ pack: pack.id, version: pack.version, ticket: item.ticket });
  let closure = null;
  let replayConverged = null;
  if (qualityPass && item.humanApproved) {
    closure = provider.close(item.ticket, item.proposal, key);
    const replay = provider.close(item.ticket, item.proposal, key);
    replayConverged = closure.effectId === replay.effectId;
  }
  const outcome = !qualityPass ? 'rejected' : !item.humanApproved ? 'held_for_approval' : item.reviewerAccepted ? 'accepted' : 'closed_not_accepted';
  const totalCostCents = Object.values(item.costCents).reduce((a, b) => a + b, 0);
  return {
    id: item.id, ticket: item.ticket, outcome, expectedOutcome: item.expectedOutcome,
    matchesExpectation: outcome === item.expectedOutcome,
    qualityPass, humanApproved: item.humanApproved, reviewerAccepted: item.reviewerAccepted,
    closed: Boolean(closure), replayConverged,
    effectId: closure?.effectId ?? null, totalCostCents,
  };
}

export function runPack(input) {
  const pack = validatePack(input);
  const provider = new SyntheticTicketProvider();
  const cases = pack.cases.map(item => evaluateCase(pack, item, provider));
  const accepted = cases.filter(item => item.outcome === 'accepted').length;
  const totalCostCents = cases.reduce((sum, item) => sum + item.totalCostCents, 0);
  const effectAttempts = cases.filter(item => item.closed).length * 2;
  const metrics = {
    currency: pack.currency,
    eligibleCases: cases.length, acceptedCases: accepted, acceptanceRate: accepted / cases.length,
    totalCostCents, costPerAcceptedCents: accepted ? totalCostCents / accepted : null,
    closedCases: cases.filter(item => item.closed).length,
    syntheticEffectAttempts: effectAttempts, syntheticEffectWrites: provider.writes,
  };
  const body = {
    schemaVersion: 1, pack: { id: pack.id, version: pack.version, digest: digest(pack) },
    evidenceClass: 'SYNTHETIC',
    status: cases.every(item => item.matchesExpectation && item.replayConverged !== false) && provider.writes === metrics.closedCases && metrics.acceptanceRate >= pack.targets.minimumAcceptanceRate && metrics.costPerAcceptedCents !== null && metrics.costPerAcceptedCents <= pack.targets.maximumCostPerAcceptedCents ? 'pass' : 'fail',
    cases, metrics,
    claim: 'Deterministic synthetic reference only; no customer result, real approval, durable provider idempotency, or production authorization is established.',
  };
  return { ...body, reportDigest: digest(body) };
}

export function verifyReport(pack, report) {
  const expected = runPack(pack);
  return { valid: digest(report) === digest(expected), expectedDigest: expected.reportDigest, observedDigest: report?.reportDigest ?? null };
}
