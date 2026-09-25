import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { allReleases, installRelease, makeRelease, publishRelease, readRelease, validateRelease, writeLocalRunReceipt } from '../src/network/registry.js';
import { buildSite } from '../src/network/build-site.js';

const metadata = JSON.parse(await readFile(new URL('../examples/invoice-release.json', import.meta.url), 'utf8'));
const pack = JSON.parse(await readFile(new URL('../packs/invoice-routing/pack.json', import.meta.url), 'utf8'));

test('release validation rejects tampering and unsupported executable kinds', () => {
  const valid = makeRelease(metadata, pack);
  assert.equal(valid.report.status, 'pass');
  assert.throws(() => makeRelease({ ...metadata, version: '0.1.1' }, pack), /identity/);
  assert.throws(() => makeRelease(metadata, { ...pack, kind: 'arbitrary-module' }), /Unsupported capability kind/);
  assert.throws(() => makeRelease({ ...metadata, publisher: 'bad/handle' }, pack), /Publisher/);
  assert.throws(() => makeRelease({ ...metadata, sourceUrl: 'javascript:alert(1)' }, pack), /sourceUrl/);
  const changed = structuredClone(valid);
  changed.pack.cases[0].proposal = 'tax-review';
  assert.throws(() => validateRelease(changed), /digest mismatch/);
});

test('publisher, installer, receipt and static catalog share a digest-checked release', async t => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'foundry-network-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const metadataFile = path.join(base, 'metadata.json');
  const packFile = path.join(base, 'pack.json');
  await writeFile(metadataFile, JSON.stringify(metadata));
  await writeFile(packFile, JSON.stringify(pack));
  const result = await publishRelease(metadataFile, packFile, base);
  assert.match(result.target, /invoice-routing\/0\.1\.0\.json$/);
  await assert.rejects(publishRelease(metadataFile, packFile, base), { code: 'EEXIST' });
  assert.equal((await allReleases(base)).length, 1);
  const installedPath = path.join(base, 'local', 'invoice.json');
  const installed = await installRelease('invoice-routing', '0.1.0', installedPath, base);
  assert.equal(installed.packDigest, (await readRelease('invoice-routing', '0.1.0', base)).packDigest);
  assert.deepEqual(JSON.parse(await readFile(installedPath)), pack);
  await assert.rejects(installRelease('invoice-routing', '0.1.0', installedPath, base), { code: 'EEXIST' });
  const receipt = await writeLocalRunReceipt('invoice-routing', '0.1.0', path.join(base, 'local', 'receipt.json'), base);
  assert.equal(receipt.acceptedCases, 1);
  assert.match(receipt.telemetry, /none/);
  const site = await buildSite(base);
  assert.equal(site.count, 1);
  const catalog = JSON.parse(await readFile(path.join(base, 'site', 'catalog.json')));
  assert.equal(catalog.capabilities[0].syntheticAccepted, 1);
  assert.deepEqual(JSON.parse(await readFile(path.join(base, 'site', 'packs', 'invoice-routing-0.1.0.json'))), pack);
  const tampered = JSON.parse(await readFile(result.target));
  tampered.pack.cases[0].proposal = 'tax-review';
  await writeFile(result.target, JSON.stringify(tampered));
  await assert.rejects(readRelease('invoice-routing', '0.1.0', base), /digest mismatch/);
});
