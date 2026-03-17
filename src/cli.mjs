#!/usr/bin/env node
/**
 * lucide — CLI for searching Lucide icons by name, tag, or category.
 *
 * Usage:
 *   lucide search <query>              search by name/tag
 *   lucide info <icon-name>            show full details for one icon
 *   lucide list [categories]           list all category names
 *   lucide list --category <name>      list icons in a category
 *   lucide update                      refresh icon data from GitHub
 */
import {
  search,
  getIcon,
  listCategories,
  listByCategory,
  updateIcons,
  iconCount,
} from './search-engine.mjs';

// ─── ANSI colours (degrade gracefully if NO_COLOR is set) ───────────────────
const NO_COLOR = process.env.NO_COLOR != null || !process.stdout.isTTY;
const c = {
  reset:   NO_COLOR ? '' : '\x1b[0m',
  bold:    NO_COLOR ? '' : '\x1b[1m',
  dim:     NO_COLOR ? '' : '\x1b[2m',
  cyan:    NO_COLOR ? '' : '\x1b[36m',
  green:   NO_COLOR ? '' : '\x1b[32m',
  yellow:  NO_COLOR ? '' : '\x1b[33m',
  blue:    NO_COLOR ? '' : '\x1b[34m',
  magenta: NO_COLOR ? '' : '\x1b[35m',
  red:     NO_COLOR ? '' : '\x1b[31m',
  gray:    NO_COLOR ? '' : '\x1b[90m',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stars(score) {
  if (score >= 150) return `${c.yellow}★★★${c.reset}`;
  if (score >= 80)  return `${c.yellow}★★ ${c.reset}`;
  if (score >= 40)  return `${c.yellow}★  ${c.reset}`;
  return                      `${c.gray}·  ${c.reset}`;
}

function formatTags(tags) {
  return tags.length
    ? `${c.gray}${tags.join(', ')}${c.reset}`
    : `${c.gray}(no tags)${c.reset}`;
}

function formatCategories(cats) {
  return cats.length
    ? cats.map(cat => `${c.blue}${cat}${c.reset}`).join(', ')
    : `${c.gray}(uncategorized)${c.reset}`;
}

function iconUrl(name) {
  return `${c.gray}https://lucide.dev/icons/${name}${c.reset}`;
}

function warn(msg) {
  process.stderr.write(`${c.yellow}⚠  ${msg}${c.reset}\n`);
}

function err(msg) {
  process.stderr.write(`${c.red}✗  ${msg}${c.reset}\n`);
}

function printSearchResults(results, query) {
  if (!results.length) {
    err(`No icons found for "${query}"`);
    process.stderr.write(
      `  Try broadening the search, or run ${c.bold}lucide list categories${c.reset} to explore.\n`
    );
    process.exitCode = 1;
    return;
  }

  const nameWidth = Math.max(12, ...results.map(r => r.name.length));

  console.log('');
  for (const result of results) {
    const name = result.deprecated
      ? `${c.gray}${result.name.padEnd(nameWidth)}${c.reset} ${c.gray}[deprecated]${c.reset}`
      : `${c.cyan}${c.bold}${result.name.padEnd(nameWidth)}${c.reset}`;

    console.log(`  ${stars(result.score)} ${name}  ${formatTags(result.tags)}`);

    if (result.categories.length) {
      console.log(`  ${' '.repeat(5 + nameWidth)}${c.dim}[${result.categories.join(', ')}]${c.reset}`);
    }
  }

  console.log('');
  console.log(
    `  ${c.dim}${results.length} result${results.length === 1 ? '' : 's'} · ` +
    `Use ${c.bold}lucide info <name>${c.dim} for details · ` +
    `https://lucide.dev/icons${c.reset}`
  );
  console.log('');
}

function printIconInfo(icon) {
  const aliasNote = icon._resolvedFrom
    ? ` ${c.gray}(resolved from alias "${icon._resolvedFrom}")${c.reset}`
    : '';

  console.log('');
  console.log(`  ${c.bold}${c.cyan}${icon.name}${c.reset}${aliasNote}`);
  console.log(`  ${'─'.repeat(icon.name.length + 2)}`);
  console.log(`  ${c.bold}Tags       ${c.reset}${formatTags(icon.tags)}`);
  console.log(`  ${c.bold}Categories ${c.reset}${formatCategories(icon.categories)}`);

  if (icon.aliases?.length) {
    console.log(`  ${c.bold}Aliases    ${c.reset}${c.gray}${icon.aliases.join(', ')}${c.reset}`);
  }

  if (icon.deprecated) {
    console.log(`  ${c.bold}Status     ${c.reset}${c.red}deprecated${c.reset}`);
  }

  console.log(`  ${c.bold}URL        ${c.reset}${iconUrl(icon.name)}`);
  console.log('');
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function cmdSearch(args) {
  // Parse flags
  let category;
  let includeDeprecated = false;
  let limit = 20;
  let json = false;
  const queryParts = [];

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--category' || args[i] === '-c') && args[i + 1]) {
      category = args[++i];
    } else if (args[i] === '--deprecated' || args[i] === '-d') {
      includeDeprecated = true;
    } else if ((args[i] === '--limit' || args[i] === '-n') && args[i + 1]) {
      limit = parseInt(args[++i], 10) || 20;
    } else if (args[i] === '--json' || args[i] === '-j') {
      json = true;
    } else if (!args[i].startsWith('-')) {
      queryParts.push(args[i]);
    }
  }

  const query = queryParts.join(' ');
  if (!query) {
    err('Please provide a search query.  e.g. lucide search upload');
    process.exitCode = 1;
    return;
  }

  const results = search(query, { category, includeDeprecated, limit });

  if (json) {
    console.log(JSON.stringify(results.map(({ score, ...r }) => r), null, 2));
    return;
  }

  printSearchResults(results, query);
}

function cmdInfo(args) {
  const name = args[0];
  if (!name) {
    err('Please provide an icon name.  e.g. lucide info heart');
    process.exitCode = 1;
    return;
  }

  const icon = getIcon(name);
  if (!icon) {
    err(`Icon "${name}" not found.`);
    process.stderr.write(`  Try ${c.bold}lucide search ${name}${c.reset} to find the correct name.\n`);
    process.exitCode = 1;
    return;
  }

  printIconInfo(icon);
}

function cmdList(args) {
  // `lucide list` or `lucide list categories` → list all categories
  // `lucide list --category <name>`           → list icons in a category
  let category;
  let showCategories = true;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--category' || args[i] === '-c') && args[i + 1]) {
      category = args[++i];
      showCategories = false;
    } else if (args[i] === 'categories') {
      showCategories = true;
    }
  }

  if (!category && showCategories) {
    const cats = listCategories();
    const nameWidth = Math.max(...cats.map(c => c.name.length));

    console.log('');
    console.log(`  ${c.bold}Lucide icon categories${c.reset}  ${c.dim}(${cats.length} total)${c.reset}`);
    console.log('');

    // Print in two columns
    const mid = Math.ceil(cats.length / 2);
    for (let i = 0; i < mid; i++) {
      const left  = cats[i];
      const right = cats[i + mid];
      const leftStr  = `${c.cyan}${left.name.padEnd(nameWidth)}${c.reset}  ${c.dim}(${String(left.count).padStart(3)})${c.reset}`;
      const rightStr = right
        ? `  ${c.cyan}${right.name.padEnd(nameWidth)}${c.reset}  ${c.dim}(${String(right.count).padStart(3)})${c.reset}`
        : '';
      console.log(`  ${leftStr}${rightStr}`);
    }

    console.log('');
    console.log(`  ${c.dim}Use: lucide list --category <name>${c.reset}`);
    console.log('');
    return;
  }

  if (category) {
    const icons = listByCategory(category);
    if (!icons.length) {
      err(`No icons found in category "${category}".`);
      process.stderr.write(`  Run ${c.bold}lucide list categories${c.reset} to see valid category names.\n`);
      process.exitCode = 1;
      return;
    }

    const nameWidth = Math.max(12, ...icons.map(i => i.name.length));

    console.log('');
    console.log(`  ${c.bold}Category: ${c.cyan}${category}${c.reset}  ${c.dim}(${icons.length} icons)${c.reset}`);
    console.log('');

    for (const icon of icons) {
      console.log(
        `  ${c.cyan}${icon.name.padEnd(nameWidth)}${c.reset}  ${formatTags(icon.tags)}`
      );
    }

    console.log('');
  }
}

async function cmdUpdate() {
  try {
    await updateIcons(msg => process.stderr.write(`  ${msg}\n`));
  } catch (e) {
    err(e.message);
    process.exitCode = 1;
  }
}

function cmdHelp() {
  console.log(`
  ${c.bold}lucide${c.reset} — search Lucide icons (${iconCount()} icons loaded)

  ${c.bold}USAGE${c.reset}
    ${c.cyan}lucide search${c.reset} <query> [--category <name>] [--limit <n>] [--deprecated]
    ${c.cyan}lucide info${c.reset} <icon-name>
    ${c.cyan}lucide list${c.reset} [categories]
    ${c.cyan}lucide list${c.reset} --category <name>
    ${c.cyan}lucide update${c.reset}

  ${c.bold}EXAMPLES${c.reset}
    lucide search "save to cloud"
    lucide search arrow up
    lucide search lock --category security
    lucide info wallet
    lucide list categories
    lucide list --category finance
    lucide update

  ${c.bold}ENV${c.reset}
    LUCIDE_ICONS_PATH   Path to a local lucide icons/ dir (skips cache)
    NO_COLOR            Disable ANSI colour output
`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const [, , cmd, ...rest] = process.argv;

switch (cmd) {
  case 'search': case 's': await cmdSearch(rest); break;
  case 'info':   case 'i': cmdInfo(rest);          break;
  case 'list':   case 'l': cmdList(rest);          break;
  case 'update': case 'u': await cmdUpdate();      break;
  case 'help':   case '-h': case '--help':
  default:
    if (cmd && cmd !== 'help' && cmd !== '-h' && cmd !== '--help') {
      // Treat bare args as a search query: `lucide heart` → `lucide search heart`
      await cmdSearch([cmd, ...rest]);
    } else {
      cmdHelp();
    }
    break;
}
