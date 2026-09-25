import { digest } from './canonical.js';
import { validatePack } from './pack.js';
import { verifyReport } from './run.js';

const REQUIRED_REDTEAM = new Set([
  'tool-description-stability', 'unannotated-destructive-tools',
  'unauthenticated-tool-exposure', 'token-audience-validation',
  'tools-call-authorization-bypass',
]);
const REQUIRED_EFFECTS = new Set([
  'concurrent_duplicate_suppression', 'applied_then_timeout_reconciliation',
  'crash_after_apply_before_checkpoint', 'preexisting_effect_reconciliation',
  'unverified_ambiguous_halt', 'declared_compensation',
  'stale_worker_fenced_after_reclaim', 'distinct_invocations_same_effect',
]);

export function assessCandidate(packInput, runReport, compatibility, redteam, effects) {
  const pack = validatePack(packInput);
  const checks = [];
  const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), detail });
  check('synthetic pack report', verifyReport(pack, runReport).valid && runReport.status === 'pass', 'Recomputed from this pack, with the expected synthetic case outcomes.');
  check('MCP compatibility report', compatibility?.schemaVersion === 1 && compatibility.status === 'pass' && Array.isArray(compatibility.results) && compatibility.results.length > 0 && compatibility.results.every(r => r.connectivity === 'pass' && r.authProbe === 'pass' && r.errors?.length === 0 && pack.contract.requiredTools.every(name => r.tools?.includes(name))), 'All reported endpoints list the required tools and pass their declared anonymous-access expectation.');
  const redteamNames = new Set(Array.isArray(redteam) ? redteam.map(r => r.scenario) : []);
  check('MCP red-team report', Array.isArray(redteam) && [...REQUIRED_REDTEAM].every(name => redteamNames.has(name)) && redteam.every(r => !r.error && Array.isArray(r.findings) && !r.findings.some(f => f.severity === 'critical' || f.severity === 'high')), 'The five default HTTP scenario results are present without errors or high-severity findings. This does not prove a complete security assessment.');
  const effectIds = new Set(Array.isArray(effects?.scenarios) ? effects.scenarios.map(s => s.id) : []);
  check('effect-runtime conformance', effects?.schemaVersion === '1.1.0' && effects.summary?.failed === 0 && effects.summary?.total === REQUIRED_EFFECTS.size && [...REQUIRED_EFFECTS].every(id => effectIds.has(id)) && effects.scenarios.every(s => s.passed === true), 'The separate runtime conformance suite passed; it is not proof that this pack used that runtime.');
  const body = {
    schemaVersion: 1, pack: { id: pack.id, version: pack.version, digest: digest(pack) },
    status: checks.every(c => c.passed) ? 'candidate' : 'blocked',
    productionEligible: false,
    checks,
    claim: 'Artifact-level checks only. Existing reports are not cryptographically bound to one endpoint, deployment, identity, or customer approval. Production promotion requires an integrated run and retained provenance.',
  };
  return { ...body, reportDigest: digest(body) };
}
