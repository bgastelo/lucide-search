/**
 * Lucide MCP Server — exposes Lucide icon search as MCP tools.
 *
 * Tools:
 *   lucide_search(query, category?, limit?)  Search icons by name or tag
 *   lucide_info(name)                        Get full details for one icon
 *   lucide_list_categories()                 List all categories with counts
 *
 * Wire up in your MCP client config:
 *   {
 *     "command": "node",
 *     "args": ["/path/to/lucide-search/src/mcp-server.mjs"]
 *   }
 */

import { search, getIcon, listCategories, updateIcons, iconCount } from './search-engine.mjs';

// ─── Minimal MCP-over-stdio implementation (JSON-RPC 2.0) ───────────────────
// This avoids needing the @modelcontextprotocol/sdk dependency.

process.stdin.setEncoding('utf8');

let inputBuffer = '';

process.stdin.on('data', chunk => {
  inputBuffer += chunk;
  // Messages are newline-delimited JSON
  const lines = inputBuffer.split('\n');
  inputBuffer = lines.pop(); // keep the incomplete last line
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) handleMessage(trimmed);
  }
});

process.stdin.on('end', () => {
  if (inputBuffer.trim()) handleMessage(inputBuffer.trim());
});

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    sendError(null, -32700, 'Parse error');
    return;
  }

  const { jsonrpc, id, method, params } = msg;
  if (jsonrpc !== '2.0') return;

  try {
    switch (method) {
      // ── MCP handshake ────────────────────────────────────────────────────
      case 'initialize':
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'lucide-search', version: '1.0.0' },
          },
        });
        break;

      case 'initialized':
        // Notification — no response needed
        break;

      // ── Tool listing ──────────────────────────────────────────────────────
      case 'tools/list':
        send({
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'lucide_search',
                description:
                  'Search Lucide icons by name, tag, or semantic meaning. ' +
                  'Returns ranked results with exact icon names, tags, and categories. ' +
                  'Use this instead of guessing icon names.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                      description:
                        'Search query — icon name, keyword, or semantic description. ' +
                        'e.g. "upload", "save to cloud", "arrow up", "payment card"',
                    },
                    category: {
                      type: 'string',
                      description:
                        'Optional: filter results to a single category. ' +
                        'e.g. "arrows", "finance", "medical". ' +
                        'Use lucide_list_categories to see all valid names.',
                    },
                    limit: {
                      type: 'integer',
                      description: 'Max results to return (default: 10, max: 50)',
                      minimum: 1,
                      maximum: 50,
                    },
                  },
                  required: ['query'],
                },
              },
              {
                name: 'lucide_info',
                description:
                  'Get full metadata for a Lucide icon: its exact name, all tags, ' +
                  'categories, aliases, and URL. Also resolves deprecated aliases to the ' +
                  'current canonical name.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Exact icon name (kebab-case), e.g. "arrow-up-circle"',
                    },
                  },
                  required: ['name'],
                },
              },
              {
                name: 'lucide_list_categories',
                description:
                  'List all Lucide icon categories with their icon counts. ' +
                  'Useful for scoping a search to a specific domain.',
                inputSchema: { type: 'object', properties: {} },
              },
            ],
          },
        });
        break;

      // ── Tool calls ────────────────────────────────────────────────────────
      case 'tools/call': {
        const { name, arguments: args = {} } = params ?? {};

        if (name === 'lucide_search') {
          const { query, category, limit = 10 } = args;
          if (!query) {
            sendError(id, -32602, '"query" is required');
            return;
          }

          const results = search(query, {
            category,
            limit: Math.min(50, Math.max(1, limit)),
          });

          if (!results.length) {
            send({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{
                  type: 'text',
                  text: `No icons found for "${query}". Try different keywords.`,
                }],
              },
            });
            return;
          }

          const lines = results.map(r => {
            const tags       = r.tags.join(', ') || '—';
            const categories = r.categories.join(', ') || '—';
            const dep        = r.deprecated ? ' [DEPRECATED]' : '';
            return `- **${r.name}**${dep}\n  tags: ${tags}\n  categories: ${categories}`;
          });

          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text:
                  `Found ${results.length} icon(s) matching "${query}":\n\n` +
                  lines.join('\n\n'),
              }],
            },
          });
          break;
        }

        if (name === 'lucide_info') {
          const { name: iconName } = args;
          if (!iconName) {
            sendError(id, -32602, '"name" is required');
            return;
          }

          const icon = getIcon(iconName);
          if (!icon) {
            send({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{
                  type: 'text',
                  text: `Icon "${iconName}" not found. Use lucide_search to find the correct name.`,
                }],
              },
            });
            return;
          }

          const parts = [
            `**${icon.name}**`,
            `Tags: ${icon.tags.join(', ') || '—'}`,
            `Categories: ${icon.categories.join(', ') || '—'}`,
          ];
          if (icon.aliases?.length) parts.push(`Aliases: ${icon.aliases.join(', ')}`);
          if (icon.deprecated)       parts.push('Status: **DEPRECATED**');
          if (icon._resolvedFrom)    parts.push(`(Resolved from alias: ${icon._resolvedFrom})`);
          parts.push(`URL: https://lucide.dev/icons/${icon.name}`);

          send({
            jsonrpc: '2.0',
            id,
            result: { content: [{ type: 'text', text: parts.join('\n') }] },
          });
          break;
        }

        if (name === 'lucide_list_categories') {
          const cats = listCategories();
          const lines = cats.map(c => `- **${c.name}** (${c.count} icons)`);
          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: `Lucide has ${cats.length} categories (${iconCount()} icons total):\n\n` +
                  lines.join('\n'),
              }],
            },
          });
          break;
        }

        sendError(id, -32601, `Unknown tool: ${name}`);
        break;
      }

      default:
        if (id != null) sendError(id, -32601, `Method not found: ${method}`);
        break;
    }
  } catch (e) {
    sendError(id ?? null, -32603, `Internal error: ${e.message}`);
  }
}
