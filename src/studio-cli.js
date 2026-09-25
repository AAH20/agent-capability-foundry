#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { catalog, loadCapability, runCapability, forkCapability } from './studio/catalog.js';
import { startStudio } from './studio/server.js';

const usage = 'Usage: node src/studio-cli.js list | run <id|pack.json> [--output report.json] | install <id> --output pack.json | fork <id> <new-id> --output pack.json | serve [--port 4327]';
async function write(file, data) { await mkdir(path.dirname(path.resolve(file)), { recursive: true }); await writeFile(file, JSON.stringify(data, null, 2) + '\n'); }
async function packFor(value) { return value.endsWith('.json') ? JSON.parse(await readFile(value, 'utf8')) : (await loadCapability(value)).pack; }
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'list' && !args.length) { for (const item of await catalog()) console.log(`${item.id}\t${item.title}\t${item.kind}`); return; }
  if (command === 'run' && (args.length === 1 || args.length === 3 && args[1] === '--output')) {
    const report = runCapability(await packFor(args[0]));
    if (args[2]) await write(args[2], report);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.status === 'pass' ? 0 : 1; return;
  }
  if (command === 'install' && args.length === 3 && args[1] === '--output') { await write(args[2], (await loadCapability(args[0])).pack); console.log(`Installed ${args[0]} to ${args[2]}`); return; }
  if (command === 'fork' && args.length === 4 && args[2] === '--output') { await write(args[3], forkCapability((await loadCapability(args[0])).pack, args[1])); console.log(`Forked ${args[0]} as ${args[1]} to ${args[3]}`); return; }
  if (command === 'serve' && (args.length === 0 || args.length === 2 && args[0] === '--port')) { const port = args.length ? Number(args[1]) : 4327; await startStudio(port); console.log(`Agent Capability Studio: http://127.0.0.1:${port}/`); return; }
  console.error(usage); process.exitCode = 2;
}
main().catch(error => { console.error(`studio: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 2; });
