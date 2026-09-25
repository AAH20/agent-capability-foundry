import { digest } from '../canonical.js';

const DECISIONS = new Set(['approve', 'reject']);

/** Project local, unverified review decisions onto an immutable intake snapshot. */
export function reviewQueue(queue, input) {
  if (!queue || queue.schemaVersion !== 1 || queue.mode !== 'READ_ONLY' || queue.evidenceClass !== 'CUSTOMER_SUPPLIED_UNVERIFIED' ||
      digest(Object.fromEntries(Object.entries(queue).filter(([key]) => key !== 'reportDigest'))) !== queue.reportDigest ||
      !Array.isArray(queue.tickets) || !input || input.schemaVersion !== 1 || input.queueDigest !== queue.reportDigest || !Array.isArray(input.decisions)) {
    throw new Error('Review decisions must bind to a valid intake queue digest');
  }
  const ticketIds = new Set(queue.tickets.map(ticket => ticket.id));
  const seen = new Set();
  const decisions = input.decisions.map(event => {
    if (!event || Object.keys(event).sort().join(',') !== 'decision,reviewer,ticketId' ||
        !ticketIds.has(event.ticketId) || seen.has(event.ticketId) || !DECISIONS.has(event.decision) ||
        typeof event.reviewer !== 'string' || !/^[A-Za-z0-9_.@-]{1,120}$/.test(event.reviewer)) {
      throw new Error('Each decision needs a unique known ticket, reviewer label, and approve/reject value');
    }
    seen.add(event.ticketId);
    return { ticketId: event.ticketId, reviewer: event.reviewer, decision: event.decision };
  });
  const byId = new Map(decisions.map(event => [event.ticketId, event]));
  const items = queue.tickets.map(ticket => ({ ...ticket, review: byId.get(ticket.id) ?? null }));
  const body = { schemaVersion: 1, evidenceClass: 'CUSTOMER_SUPPLIED_UNVERIFIED', mode: 'LOCAL_REVIEW_ONLY', queueDigest: queue.reportDigest,
    counts: { pending: items.filter(item => !item.review).length, approved: items.filter(item => item.review?.decision === 'approve').length,
      rejected: items.filter(item => item.review?.decision === 'reject').length }, items,
    claim: 'Reviewer labels are unverified local input. These decisions cannot authorize provider writes.' };
  return { ...body, reportDigest: digest(body) };
}
