#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { runStagingDemo } from './ops/staging.js';
import { importTicketExport } from './ops/intake.js';
import { reviewQueue } from './ops/review.js';

const json = async file => JSON.parse(await readFile(file, 'utf8'));
async function output(file, data) { await mkdir(path.dirname(path.resolve(file)), { recursive: true }); await writeFile(file, JSON.stringify(data, null, 2) + '\n'); }

async function main() {
  const [command, input, maybeDecisions, maybeFlag, maybeDestination] = process.argv.slice(2);
  const review = command === 'review';
  const flag = review ? maybeFlag : maybeDecisions;
  const destination = review ? maybeDestination : maybeFlag;
  if (!['demo', 'import', 'review'].includes(command) || !input || flag !== '--output' || !destination || process.argv.length !== (review ? 7 : 6)) {
    console.error('Usage: node src/ops-cli.js demo <pack.json> --output <report.json>');
    console.error('       node src/ops-cli.js import <saved-export.json> --output <queue.json>');
    console.error('       node src/ops-cli.js review <queue.json> <decisions.json> --output <review.json>');
    process.exitCode = 2; return;
  }
  const result = command === 'demo' ? await runStagingDemo(await json(input)) : command === 'import' ? importTicketExport(await json(input)) : reviewQueue(await json(input), await json(maybeDecisions));
  await output(destination, result);
  console.log(command === 'demo' ? `${result.status}: ${result.metrics.acceptedCases}/${result.metrics.eligibleCases} accepted via synthetic MCP fixture; ${result.metrics.syntheticProviderWrites} provider writes` : command === 'import' ? `imported ${result.count} metadata-only ticket records to ${destination}` : `reviewed ${result.counts.approved + result.counts.rejected} tickets; ${result.counts.pending} pending`);
  if (command === 'demo' && result.status !== 'pass') process.exitCode = 1;
}

main().catch(error => { console.error(`CapabilityOps: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 2; });
