const ID = /^[a-z][a-z0-9-]{1,63}$/;
const COSTS = ['inference', 'retrieval', 'infrastructure', 'humanReview', 'rework', 'operations', 'setupAllocated'];
const OUTCOMES = new Set(['accepted', 'rejected', 'held_for_approval', 'closed_not_accepted']);

export function validatePack(pack) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack) || pack.schemaVersion !== 1) throw new Error('Expected capability pack schemaVersion 1');
  if (!ID.test(pack.id ?? '') || typeof pack.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(pack.version)) throw new Error('Invalid pack id or semantic version');
  if (pack.evidenceClass !== 'SYNTHETIC') throw new Error('This runner only accepts SYNTHETIC packs');
  if (pack.currency !== 'USD') throw new Error('This first pack supports USD cents only');
  if (!pack.contract || !Array.isArray(pack.contract.requiredTools) || !pack.contract.requiredTools.includes('get_ticket') || !pack.contract.requiredTools.includes('close_ticket') || !pack.contract.humanApprovalRequiredFor?.includes('close_ticket')) throw new Error('Support pack requires declared tools and closure approval');
  if (JSON.stringify(pack.costCategories) !== JSON.stringify(COSTS)) throw new Error('All seven cost categories must be declared in order');
  if (!pack.targets || typeof pack.targets.minimumAcceptanceRate !== 'number' || pack.targets.minimumAcceptanceRate < 0 || pack.targets.minimumAcceptanceRate > 1 || !Number.isSafeInteger(pack.targets.maximumCostPerAcceptedCents) || pack.targets.maximumCostPerAcceptedCents < 0) throw new Error('Pack needs valid acceptance and unit-cost targets');
  if (!Array.isArray(pack.cases) || pack.cases.length < 1 || pack.cases.length > 1000) throw new Error('Pack needs 1 to 1000 cases');
  const ids = new Set();
  const tickets = new Set();
  for (const item of pack.cases) {
    if (!ID.test(item.id ?? '') || ids.has(item.id)) throw new Error('Case IDs must be unique safe identifiers');
    ids.add(item.id);
    if (typeof item.ticket !== 'string' || !item.ticket || tickets.has(item.ticket)) throw new Error('Ticket IDs must be unique nonempty strings');
    tickets.add(item.ticket);
    if (typeof item.referenceResolution !== 'string' || !item.referenceResolution || typeof item.proposal !== 'string' || !item.proposal) throw new Error(`Case ${item.id} needs resolutions`);
    if (typeof item.humanApproved !== 'boolean' || typeof item.reviewerAccepted !== 'boolean' || !OUTCOMES.has(item.expectedOutcome)) throw new Error(`Case ${item.id} has invalid review or expectation`);
    if (!item.costCents || Object.keys(item.costCents).sort().join(',') !== [...COSTS].sort().join(',')) throw new Error(`Case ${item.id} needs exactly seven cost categories`);
    for (const value of Object.values(item.costCents)) if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Case ${item.id} costs must be nonnegative integer cents`);
  }
  return pack;
}
