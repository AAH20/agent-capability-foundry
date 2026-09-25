import { digest } from '../canonical.js';

const ID = /^[a-z][a-z0-9-]{1,63}$/;
const COSTS = ['inference', 'retrieval', 'infrastructure', 'humanReview', 'rework', 'operations', 'setupAllocated'];
const OUTCOMES = new Set(['accepted', 'rejected', 'held_for_approval', 'routed_not_accepted']);

export function validateInvoicePack(pack) {
  if (!pack || pack.schemaVersion !== 1 || pack.kind !== 'invoice-routing' || !ID.test(pack.id ?? '') || !/^\d+\.\d+\.\d+$/.test(pack.version ?? '') || pack.evidenceClass !== 'SYNTHETIC' || pack.currency !== 'USD') throw new Error('Invalid synthetic invoice-routing pack');
  if (JSON.stringify(pack.costCategories) !== JSON.stringify(COSTS)) throw new Error('All seven cost categories are required');
  if (!Array.isArray(pack.contract?.requiredTools) || !pack.contract.requiredTools.includes('get_invoice') || !pack.contract.requiredTools.includes('route_invoice') || !Array.isArray(pack.contract.humanApprovalRequiredFor) || !pack.contract.humanApprovalRequiredFor.includes('route_invoice')) throw new Error('Invoice routing requires declared read and approved write tools');
  if (!pack.targets || typeof pack.targets.minimumAcceptanceRate !== 'number' || pack.targets.minimumAcceptanceRate < 0 || pack.targets.minimumAcceptanceRate > 1 || !Number.isSafeInteger(pack.targets.maximumCostPerAcceptedCents) || pack.targets.maximumCostPerAcceptedCents < 0) throw new Error('Invalid targets');
  if (!Array.isArray(pack.cases) || pack.cases.length < 1 || pack.cases.length > 1000) throw new Error('Pack needs 1 to 1000 cases');
  const seen = new Set();
  for (const item of pack.cases) {
    if (!ID.test(item.id ?? '') || !/^[A-Za-z0-9-]{1,80}$/.test(item.invoice ?? '') || seen.has(item.id) || seen.has(item.invoice)) throw new Error('Invalid or duplicate case/invoice identifier');
    seen.add(item.id); seen.add(item.invoice);
    if (!ID.test(item.referenceQueue ?? '') || !ID.test(item.proposal ?? '') || typeof item.humanApproved !== 'boolean' || typeof item.reviewerAccepted !== 'boolean' || !OUTCOMES.has(item.expectedOutcome)) throw new Error(`Invalid routing case ${item.id}`);
    if (!item.costCents || Object.keys(item.costCents).sort().join(',') !== [...COSTS].sort().join(',') || Object.values(item.costCents).some(cost => !Number.isSafeInteger(cost) || cost < 0)) throw new Error(`Invalid cost categories for ${item.id}`);
  }
  return pack;
}

/** Independent deterministic example; no accounts-payable system or payment call. */
export function runInvoicePack(input) {
  const pack = validateInvoicePack(input);
  const effects = new Map();
  let attempts = 0;
  function route(invoice, queue, key) {
    attempts++;
    const prior = effects.get(key);
    if (prior) {
      if (prior.invoice !== invoice || prior.queue !== queue) throw new Error('Idempotency key reused for different invoice routing');
      return prior;
    }
    const effect = { invoice, queue, effectId: `synthetic-${invoice}` };
    effects.set(key, effect);
    return effect;
  }
  const cases = pack.cases.map(item => {
    const qualityPass = item.proposal === item.referenceQueue;
    let routed = false;
    let replayConverged = null;
    if (qualityPass && item.humanApproved) {
      const key = digest({ pack: pack.id, version: pack.version, invoice: item.invoice });
      const effect = route(item.invoice, item.proposal, key);
      const replay = route(item.invoice, item.proposal, key);
      routed = true;
      replayConverged = effect.effectId === replay.effectId;
    }
    const outcome = !qualityPass ? 'rejected' : !item.humanApproved ? 'held_for_approval' : item.reviewerAccepted ? 'accepted' : 'routed_not_accepted';
    return { id: item.id, invoice: item.invoice, outcome, expectedOutcome: item.expectedOutcome, qualityPass, humanApproved: item.humanApproved, reviewerAccepted: item.reviewerAccepted, routed, replayConverged, totalCostCents: Object.values(item.costCents).reduce((a, b) => a + b, 0) };
  });
  const accepted = cases.filter(item => item.outcome === 'accepted').length;
  const totalCostCents = cases.reduce((sum, item) => sum + item.totalCostCents, 0);
  const metrics = { eligibleCases: cases.length, acceptedCases: accepted, acceptanceRate: accepted / cases.length, totalCostCents, costPerAcceptedCents: accepted ? totalCostCents / accepted : null, routedCases: cases.filter(item => item.routed).length, syntheticEffectAttempts: attempts, syntheticEffectWrites: effects.size, currency: pack.currency };
  const body = { schemaVersion: 1, pack: { id: pack.id, version: pack.version, digest: digest(pack) }, evidenceClass: 'SYNTHETIC', status: cases.every(item => item.outcome === item.expectedOutcome && item.replayConverged !== false) && effects.size === metrics.routedCases && attempts === effects.size * 2 && metrics.acceptanceRate >= pack.targets.minimumAcceptanceRate && metrics.costPerAcceptedCents !== null && metrics.costPerAcceptedCents <= pack.targets.maximumCostPerAcceptedCents ? 'pass' : 'fail', cases, metrics, claim: 'Synthetic invoice routing only. No supplier data, authenticated reviewer, accounting connector, payment, or production authorization.' };
  return { ...body, reportDigest: digest(body) };
}
