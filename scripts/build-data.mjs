#!/usr/bin/env node
/**
 * Builds data/icons.json from a local Lucide repo clone.
 * Usage: node scripts/build-data.mjs [path-to-lucide/icons]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '..');

const iconsDir = process.argv[2] ?? '/tmp/pi-github-repos/lucide-icons/lucide/icons';
const outFile = join(repoRoot, 'data', 'icons.json');

console.log(`Reading icons from: ${iconsDir}`);

const files = readdirSync(iconsDir).filter(f => f.endsWith('.json'));
const icons = {};

for (const file of files) {
  const name = file.replace('.json', '');
  const raw = JSON.parse(readFileSync(join(iconsDir, file), 'utf8'));

  icons[name] = {
    tags: raw.tags ?? [],
    categories: raw.categories ?? [],
    ...(raw.deprecated ? { deprecated: true } : {}),
    // Only include non-deprecated aliases (useful as alternate search names)
    ...(raw.aliases?.length
      ? { aliases: raw.aliases.filter(a => !a.deprecated).map(a => a.name) }
      : {}),
  };
}

mkdirSync(join(repoRoot, 'data'), { recursive: true });
writeFileSync(outFile, JSON.stringify(icons, null, 0));

const kb = Math.round(Buffer.byteLength(JSON.stringify(icons)) / 1024);
console.log(`✓ Built ${Object.keys(icons).length} icons → data/icons.json (${kb} KB raw)`);
