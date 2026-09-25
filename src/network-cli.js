#!/usr/bin/env node
import { allReleases, installRelease, publishRelease, writeLocalRunReceipt } from './network/registry.js';
import { buildSite } from './network/build-site.js';

const usage = `Usage:
  node src/network-cli.js publish <metadata.json> <pack.json>
  node src/network-cli.js verify
  node src/network-cli.js list
  node src/network-cli.js install <id@version> <output.pack.json>
  node src/network-cli.js run <id@version> <output.receipt.json>
  node src/network-cli.js build-site`;

function parseRef(value) {
  const match = /^([a-z][a-z0-9-]{1,63})@(\d+\.\d+\.\d+)$/.exec(value ?? '');
  if (!match) throw new Error('Use id@major.minor.patch');
  return [match[1], match[2]];
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'publish' && args.length === 2) {
    const result = await publishRelease(...args);
    console.log(`Created ${result.target}. Open a pull request for review; this command does not publish remotely.`);
    return;
  }
  if (command === 'verify' && !args.length) {
    const releases = await allReleases();
    console.log(`Verified ${releases.length} digest-pinned synthetic releases.`);
    return;
  }
  if (command === 'list' && !args.length) {
    for (const release of await allReleases()) console.log(`${release.metadata.id}@${release.metadata.version}\t${release.metadata.title}\t${release.metadata.publisher}`);
    return;
  }
  if (command === 'install' && args.length === 2) {
    const [id, version] = parseRef(args[0]);
    const result = await installRelease(id, version, args[1]);
    console.log(`Installed ${id}@${version} to ${result.output}; digest ${result.packDigest}`);
    return;
  }
  if (command === 'run' && args.length === 2) {
    const [id, version] = parseRef(args[0]);
    const receipt = await writeLocalRunReceipt(id, version, args[1]);
    console.log(`Synthetic run: ${receipt.status}; ${receipt.acceptedCases}/${receipt.eligibleCases} accepted. Local receipt: ${args[1]}`);
    return;
  }
  if (command === 'build-site' && !args.length) {
    const result = await buildSite();
    console.log(`Built ${result.count} releases in ${result.target}`);
    return;
  }
  console.error(usage); process.exitCode = 2;
}
main().catch(error => { console.error(`network: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 2; });
