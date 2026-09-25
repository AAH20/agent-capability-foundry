import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allReleases, root } from './registry.js';

const template = fileURLToPath(new URL('./site.html', import.meta.url));
const script = fileURLToPath(new URL('./site.js', import.meta.url));

export async function buildSite(base = root) {
  const releases = await allReleases(base);
  const target = path.join(base, 'site');
  await rm(target, { recursive: true, force: true });
  await mkdir(path.join(target, 'packs'), { recursive: true });
  const items = [];
  for (const release of releases) {
    const { metadata, pack, packDigest, report } = release;
    const file = `packs/${metadata.id}-${metadata.version}.json`;
    await writeFile(path.join(target, file), JSON.stringify(pack, null, 2) + '\n');
    items.push({ ...metadata, packDigest, packUrl: file, evidenceClass: pack.evidenceClass, syntheticStatus: report.status, syntheticAccepted: report.metrics.acceptedCases, syntheticEligible: report.metrics.eligibleCases });
  }
  await Promise.all([
    writeFile(path.join(target, 'index.html'), await readFile(template)),
    writeFile(path.join(target, 'site.js'), await readFile(script)),
    writeFile(path.join(target, 'catalog.json'), JSON.stringify({ schemaVersion: 1, evidenceClass: 'SYNTHETIC', capabilities: items }, null, 2) + '\n'),
    writeFile(path.join(target, '.nojekyll'), '')
  ]);
  return { target, count: releases.length };
}
