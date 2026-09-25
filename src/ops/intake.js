import { digest } from '../canonical.js';

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const STATUS = new Set(['open', 'pending', 'solved', 'closed']);

/** Local, read-only intake of a deliberately narrow customer-supplied export. */
export function importTicketExport(input) {
  if (!input || input.schemaVersion !== 1 || input.source !== 'customer-supplied-export' || !Array.isArray(input.tickets) || input.tickets.length > 10000) throw new Error('Expected version 1 customer-supplied ticket export with at most 10000 tickets');
  const seen = new Set();
  const tickets = input.tickets.map(ticket => {
    if (!ticket || Object.keys(ticket).sort().join(',') !== 'id,status,updatedAt' || !ID.test(ticket.id ?? '') || seen.has(ticket.id) || !STATUS.has(ticket.status) || typeof ticket.updatedAt !== 'string' || !Number.isFinite(Date.parse(ticket.updatedAt))) throw new Error('Each ticket must contain a unique id, supported status, and updatedAt only');
    seen.add(ticket.id);
    return { id: ticket.id, status: ticket.status, updatedAt: ticket.updatedAt };
  });
  const body = { schemaVersion: 1, evidenceClass: 'CUSTOMER_SUPPLIED_UNVERIFIED', mode: 'READ_ONLY', sourceDigest: digest(input), count: tickets.length, tickets, claim: 'Local export normalization only. Source permission, completeness, identity, and case acceptance are not verified.' };
  return { ...body, reportDigest: digest(body) };
}
