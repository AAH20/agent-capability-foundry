import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePack } from '../pack.js';
import { runPack } from '../run.js';
import { validateInvoicePack, runInvoicePack } from './invoice.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ID = /^[a-z][a-z0-9-]{1,63}$/;
const drivers = { 'support-resolution': { validate: validatePack, run: runPack }, 'invoice-routing': { validate: validateInvoicePack, run: runInvoicePack } };

export async function catalog() {
  const raw = JSON.parse(await readFile(path.join(root, 'studio/catalog.json'), 'utf8'));
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.capabilities) || raw.capabilities.length > 100) throw new Error('Invalid Studio catalog');
  const seen = new Set();
  for (const item of raw.capabilities) {
    if (!ID.test(item.id ?? '') || seen.has(item.id) || !drivers[item.kind] || item.pack !== `packs/${item.id}/pack.json` || typeof item.title !== 'string' || typeof item.tagline !== 'string' || !Array.isArray(item.tooling)) throw new Error('Invalid Studio catalog entry');
    seen.add(item.id);
  }
  return raw.capabilities;
}

export async function loadCapability(id) {
  const entry = (await catalog()).find(item => item.id === id);
  if (!entry) throw new Error('Unknown capability');
  const pack = JSON.parse(await readFile(path.join(root, entry.pack), 'utf8'));
  if (pack.id !== entry.id || (pack.kind ?? 'support-resolution') !== entry.kind) throw new Error('Catalog/pack mismatch');
  drivers[entry.kind].validate(pack);
  return { entry, pack };
}

export function runCapability(pack) {
  const kind = pack?.kind ?? 'support-resolution';
  if (!drivers[kind]) throw new Error('Unsupported capability kind');
  return drivers[kind].run(pack);
}

export function forkCapability(pack, id) {
  if (!ID.test(id ?? '')) throw new Error('Fork id must be a safe lowercase slug');
  const kind = pack?.kind ?? 'support-resolution';
  if (!drivers[kind]) throw new Error('Unsupported capability kind');
  drivers[kind].validate(pack);
  const fork = structuredClone(pack);
  fork.id = id;
  fork.version = '0.1.0';
  fork.description = `Local fork of ${pack.id}. ${pack.description ?? ''}`.trim();
  drivers[kind].validate(fork);
  return fork;
}
