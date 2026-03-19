/**
 * Lucide icon search engine — shared core used by both CLI and MCP server.
 *
 * Data priority:
 *   1. LUCIDE_ICONS_PATH env var (path to a local icons/ directory — always fresh)
 *   2. ~/.cache/lucide-search/icons.json  (updated by `lucide update`)
 *   3. Bundled data/icons.json            (shipped with the package)
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const CACHE_DIR  = join(homedir(), '.cache', 'lucide-search');
export const CACHE_FILE = join(CACHE_DIR, 'icons.json');
const BUNDLED_DATA      = join(__dirname, '../data/icons.json');

/** @type {Record<string, IconEntry> | null} */
let _cache = null;

/**
 * @typedef {{ tags: string[], categories: string[], deprecated?: true, aliases?: string[] }} IconEntry
 */

/** Load icon data (cached in memory after first call). */
export function loadIcons() {
  if (_cache) return _cache;

  // 1. Env-var override: read directly from a local clone's icons/ directory
  const envPath = process.env.LUCIDE_ICONS_PATH;
  if (envPath && existsSync(envPath)) {
    _cache = loadFromDir(envPath);
    return _cache;
  }

  // 2. User cache (written by `lucide update`), else bundled data
  const dataFile = existsSync(CACHE_FILE) ? CACHE_FILE
                 : existsSync(BUNDLED_DATA) ? BUNDLED_DATA
                 : null;

  if (!dataFile) {
    throw new Error(
      'No icon data found. Run `lucide update` to download the latest Lucide icon set.'
    );
  }

  _cache = JSON.parse(readFileSync(dataFile, 'utf8'));
  return _cache;
}

/** Force reload on next call (useful after an update). */
export function invalidateCache() {
  _cache = null;
}

/** Read and normalise icons from a directory of per-icon .json files (local clone). */
function loadFromDir(dir) {
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const icons = {};
  for (const file of files) {
    const name = file.replace('.json', '');
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    icons[name] = normalise(raw);
  }
  return icons;
}

function normalise(raw) {
  return {
    tags:       raw.tags       ?? [],
    categories: raw.categories ?? [],
    ...(raw.deprecated ? { deprecated: true } : {}),
    ...(raw.aliases?.length
      ? { aliases: raw.aliases.filter(a => !a.deprecated).map(a => a.name) }
      : {}),
  };
}

// ─── Search ─────────────────────────────────────────────────────────────────

/**
 * Score an icon against a list of query words.
 * Higher is better. Returns 0 if no match at all.
 */
function scoreIcon(name, icon, queryWords) {
  let score = 0;
  const nameLower  = name.toLowerCase();
  const nameParts  = nameLower.split('-');
  const tagsLower  = icon.tags.map(t => t.toLowerCase());
  const aliasLower = (icon.aliases ?? []).map(a => a.toLowerCase());

  for (const word of queryWords) {
    // ── Name matching ──────────────────────────────────────────────────────
    if (nameLower === word)               { score += 100; }
    else if (nameParts.includes(word))    { score += 90; }  // exact segment beats prefix
    else if (nameLower.startsWith(word))  { score += 75; }
    else if (nameLower.includes(word))    { score += 45; }

    // ── Alias matching ─────────────────────────────────────────────────────
    if (aliasLower.includes(word))        score += 55;

    // ── Tag matching ───────────────────────────────────────────────────────
    if (tagsLower.includes(word))                        score += 80;
    else if (tagsLower.some(t => t.startsWith(word)))    score += 40;
    else if (tagsLower.some(t => t.includes(word)))      score += 20;
  }

  // Bonus: every query word matched something (phrase match quality)
  const allMatched = queryWords.every(word =>
    nameLower.includes(word) ||
    tagsLower.some(t => t.includes(word)) ||
    aliasLower.some(a => a.includes(word))
  );
  if (allMatched && queryWords.length > 1) score += 30;

  // Strong bonus: every query word is a part of the icon name itself
  // e.g. "chevron left" → "chevron-left" should always beat icons that only
  // mention these words in their tags (like "between-horizontal-end")
  const allInName = queryWords.length > 1 &&
    queryWords.every(word => nameParts.includes(word));
  if (allInName) score += 50;

  // Perfect name match: the query words compose the entire icon name with no
  // extra parts — "chevron left" → "chevron-left" beats "circle-chevron-left"
  const perfectNameMatch = allInName && queryWords.length === nameParts.length;
  if (perfectNameMatch) score += 30;

  return score;
}

/**
 * Search icons by name, tag, or alias.
 *
 * @param {string} query
 * @param {{ category?: string, includeDeprecated?: boolean, limit?: number }} opts
 * @returns {{ name: string, score: number } & IconEntry[]}
 */
export function search(query, { category, includeDeprecated = false, limit = 20 } = {}) {
  const icons = loadIcons();
  const queryWords = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!queryWords.length) return [];

  const results = [];
  for (const [name, icon] of Object.entries(icons)) {
    if (!includeDeprecated && icon.deprecated) continue;
    if (category && !icon.categories.includes(category)) continue;

    const score = scoreIcon(name, icon, queryWords);
    if (score > 0) results.push({ name, score, ...icon });
  }

  return results
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * Get full details for a single icon by exact name (also checks aliases).
 *
 * @param {string} name
 * @returns {({ name: string } & IconEntry) | null}
 */
export function getIcon(name) {
  const icons = loadIcons();
  const key = name.toLowerCase();

  if (icons[key]) return { name: key, ...icons[key] };

  // Fall back to alias lookup
  for (const [iconName, icon] of Object.entries(icons)) {
    if ((icon.aliases ?? []).includes(key)) {
      return { name: iconName, ...icon, _resolvedFrom: key };
    }
  }

  return null;
}

/**
 * List all categories with non-deprecated icon counts.
 * @returns {{ name: string, count: number }[]}
 */
export function listCategories() {
  const icons = loadIcons();
  const counts = {};

  for (const icon of Object.values(icons)) {
    if (icon.deprecated) continue;
    for (const cat of icon.categories) {
      counts[cat] = (counts[cat] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, count }));
}

/**
 * List all icons in a category, sorted by name.
 * @param {string} category
 * @param {{ includeDeprecated?: boolean }} opts
 * @returns {({ name: string } & IconEntry)[]}
 */
export function listByCategory(category, { includeDeprecated = false } = {}) {
  const icons = loadIcons();
  return Object.entries(icons)
    .filter(([, icon]) => {
      if (!includeDeprecated && icon.deprecated) return false;
      return icon.categories.includes(category);
    })
    .map(([name, icon]) => ({ name, ...icon }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Total number of icons in the active dataset. */
export function iconCount() {
  return Object.keys(loadIcons()).length;
}

// ─── Update ──────────────────────────────────────────────────────────────────

/**
 * Download fresh icon metadata from GitHub and write to the user cache.
 * Uses git sparse-checkout so only the icons/ directory is fetched (~500 KB).
 *
 * @param {(msg: string) => void} log  Progress log callback
 * @returns {Promise<number>} Number of icons cached
 */
export async function updateIcons(log = console.error) {
  const tmpDir = join(CACHE_DIR, '_update_tmp');

  log('Fetching icon data from GitHub…');

  try {
    execSync(`rm -rf "${tmpDir}"`, { stdio: 'ignore' });
    mkdirSync(tmpDir, { recursive: true });

    execSync(
      `git clone --depth=1 --filter=blob:none --sparse https://github.com/lucide-icons/lucide.git "${tmpDir}"`,
      { stdio: 'ignore' }
    );
    execSync(`git -C "${tmpDir}" sparse-checkout set icons`, { stdio: 'ignore' });

    log('Processing icon metadata…');
    const icons = loadFromDir(join(tmpDir, 'icons'));

    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(icons, null, 0));

    execSync(`rm -rf "${tmpDir}"`, { stdio: 'ignore' });
    invalidateCache();

    const count = Object.keys(icons).length;
    log(`✓  Cached ${count} icons → ${CACHE_FILE}`);
    return count;
  } catch (err) {
    try { execSync(`rm -rf "${tmpDir}"`, { stdio: 'ignore' }); } catch {}
    throw new Error(`Update failed: ${err.message}`);
  }
}
