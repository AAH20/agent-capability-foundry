import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from '../canonical.js';
import { runCapability } from '../studio/catalog.js';

export const root = fileURLToPath(new URL('../../', import.meta.url));
const ID = /^[a-z][a-z0-9-]{1,63}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const MAX_BYTES = 256 * 1024;

async function readJson(file) {
  const raw = await readFile(file);
  if (raw.length > MAX_BYTES) throw new Error('Registry file exceeds 256 KiB');
  return JSON.parse(raw.toString('utf8'));
}

function bounded(value, name, max) {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > max || /[\u0000-\u001f]/.test(value)) throw new Error(`Invalid ${name}`);
}

export function validateRelease(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.schemaVersion !== 1) throw new Error('Expected release schemaVersion 1');
  const { metadata, pack, packDigest } = input;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Release metadata required');
  if (!ID.test(metadata.id ?? '') || !VERSION.test(metadata.version ?? '') || metadata.id !== pack?.id || metadata.version !== pack?.version) throw new Error('Release identity must match pack');
  bounded(metadata.title, 'title', 80);
  bounded(metadata.category, 'category', 50);
  bounded(metadata.tagline, 'tagline', 180);
  bounded(metadata.publisher, 'publisher', 39);
  if (!HANDLE.test(metadata.publisher)) throw new Error('Publisher must be a GitHub-style handle');
  if (!['Apache-2.0', 'MIT', 'BSD-3-Clause', 'CC0-1.0'].includes(metadata.license)) throw new Error('Unsupported release license');
  if (!Array.isArray(metadata.tooling) || metadata.tooling.length > 8 || metadata.tooling.some(item => typeof item !== 'string' || item.length < 1 || item.length > 40)) throw new Error('Invalid tooling labels');
  if (!/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_./-]+)?$/.test(metadata.sourceUrl ?? '')) throw new Error('sourceUrl must be a GitHub HTTPS URL');
  const actualDigest = digest(pack);
  if (packDigest !== actualDigest) throw new Error('Pack digest mismatch');
  const report = runCapability(pack); // Driver validation; no imported third-party code.
  if (report.status !== 'pass') throw new Error('Synthetic pack must pass its declared cases and targets');
  return { ...input, report };
}

export function makeRelease(metadata, pack) {
  return validateRelease({ schemaVersion: 1, metadata, pack, packDigest: digest(pack) });
}

export function releasePath(id, version, base = root) {
  if (!ID.test(id ?? '') || !VERSION.test(version ?? '')) throw new Error('Invalid release ID or version');
  return path.join(base, 'registry', 'packs', id, `${version}.json`);
}

export async function publishRelease(metadataFile, packFile, base = root) {
  const [metadata, pack] = await Promise.all([readJson(metadataFile), readJson(packFile)]);
  const { report, ...release } = makeRelease(metadata, pack);
  const target = releasePath(metadata.id, metadata.version, base);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(release, null, 2) + '\n', { flag: 'wx' });
  return { target, report };
}

export async function readRelease(id, version, base = root) {
  return validateRelease(await readJson(releasePath(id, version, base)));
}

export async function allReleases(base = root) {
  const dir = path.join(base, 'registry', 'packs');
  let names;
  try { names = await readdir(dir, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const releases = [];
  for (const folder of names) {
    if (!folder.isDirectory() || !ID.test(folder.name)) throw new Error('Unexpected registry entry');
    for (const file of await readdir(path.join(dir, folder.name), { withFileTypes: true })) {
      if (!file.isFile() || !VERSION.test(file.name.replace(/\.json$/, '')) || !file.name.endsWith('.json')) throw new Error('Unexpected release file');
      releases.push(await readRelease(folder.name, file.name.slice(0, -5), base));
    }
  }
  return releases.sort((a, b) => a.metadata.id.localeCompare(b.metadata.id) || a.metadata.version.localeCompare(b.metadata.version));
}

export async function installRelease(id, version, output, base = root) {
  const release = await readRelease(id, version, base);
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(output, JSON.stringify(release.pack, null, 2) + '\n', { flag: 'wx' });
  return { output, packDigest: release.packDigest };
}

export async function writeLocalRunReceipt(id, version, output, base = root) {
  const release = await readRelease(id, version, base);
  const report = release.report;
  const receipt = { schemaVersion: 1, evidenceClass: 'SYNTHETIC', id, version, packDigest: release.packDigest, reportDigest: report.reportDigest, status: report.status, acceptedCases: report.metrics.acceptedCases, eligibleCases: report.metrics.eligibleCases, createdAt: new Date().toISOString(), telemetry: 'none; written only to this local file' };
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return receipt;
}
