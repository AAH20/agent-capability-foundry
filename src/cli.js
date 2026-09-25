#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { runPack, verifyReport } from './run.js';
import { assessCandidate } from './gate.js';

const json = async file => JSON.parse(await readFile(file, 'utf8'));
async function write(file, value) {
  await mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n');
}

function help() {
  console.error('Usage: agent-capability-foundry run <pack.json> --output <report.json>');
  console.error('       agent-capability-foundry verify <pack.json> <report.json>');
  console.error('       agent-capability-foundry gate <pack.json> <report.json> --compat <json> --redteam <json> --effects <json> --output <gate.json>');
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'run' && args.length === 3 && args[1] === '--output') {
    const report = runPack(await json(args[0]));
    await write(args[2], report);
    console.log(`${report.status}: ${report.metrics.acceptedCases}/${report.metrics.eligibleCases} accepted; ${report.metrics.totalCostCents} total synthetic cents; ${report.metrics.costPerAcceptedCents ?? 'n/a'} cents per accepted case`);
    process.exitCode = report.status === 'pass' ? 0 : 1;
    return;
  }
  if (command === 'verify' && args.length === 2) {
    const result = verifyReport(await json(args[0]), await json(args[1]));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.valid ? 0 : 1;
    return;
  }
  if (command === 'gate' && args.length === 10) {
    const [packFile, runFile, ...flags] = args;
    const option = {};
    for (let i = 0; i < flags.length; i += 2) option[flags[i]] = flags[i + 1];
    if (['--compat', '--redteam', '--effects', '--output'].some(key => !option[key]) || Object.keys(option).length !== 4) { help(); process.exitCode = 2; return; }
    const report = assessCandidate(await json(packFile), await json(runFile), await json(option['--compat']), await json(option['--redteam']), await json(option['--effects']));
    await write(option['--output'], report);
    console.log(`${report.status}: ${report.checks.filter(c => c.passed).length}/${report.checks.length} artifact checks passed; productionEligible=false`);
    process.exitCode = report.status === 'candidate' ? 0 : 1;
    return;
  }
  help(); process.exitCode = 2;
}

main().catch(error => { console.error(`agent-capability-foundry: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 2; });
