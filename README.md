# lucide-search

CLI + MCP server for searching [Lucide icons](https://lucide.dev) by name, tags, or semantic meaning.
Never hallucinate an icon name again — 1,703 icons with full tag metadata, zero dependencies.

---

## CLI

### Install

```bash
# From the project directory:
npm link

# Or run directly:
node /path/to/lucide-search/src/cli.mjs search heart
```

### Usage

```bash
# Search by name or semantic meaning
lucide search "save to cloud"
lucide search arrow up
lucide search lock --category security
lucide search notification --limit 5

# Show full details for a specific icon
lucide info wallet
lucide info heart-pulse

# Browse categories
lucide list categories
lucide list --category finance

# Update icon data from GitHub
lucide update

# Help
lucide --help
```

### Example output

```
$ lucide search "save upload"

  upload-cloud    ★★★  cloud, arrow, storage, backup, save
                       [files, connectivity]
  cloud-upload    ★★   cloud, arrow, upload
                       [files, connectivity]
  save            ★★   disk, floppy, storage, persist
                       [files, development]
  hard-drive-upload ★  storage, disk, upload
                       [devices]

$ lucide info wallet

  wallet
  Tags:        money, payment, purse, finance, cash
  Categories:  finance, shopping
  Aliases:     —
  URL:         https://lucide.dev/icons/wallet
```

### Options

| Flag | Description |
|------|-------------|
| `--category <name>` | Filter results to a specific category |
| `--limit <n>` | Max results (default: 20) |
| `--deprecated` | Include deprecated icons in results |
| `--json` | Output raw JSON (useful for scripting) |

---

## MCP Server

Expose Lucide icon search as tools that any MCP-compatible LLM can call directly.

### Pi configuration

Add to `~/.pi/mcp.json` or your project's `.pi/mcp.json`:

```json
{
  "mcpServers": {
    "lucide": {
      "command": "node",
      "args": ["/Users/you/work/lucide-search/src/mcp-server.mjs"]
    }
  }
}
```

### Claude Desktop configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lucide": {
      "command": "node",
      "args": ["/Users/you/work/lucide-search/src/mcp-server.mjs"]
    }
  }
}
```

### Tools exposed

| Tool | Parameters | Description |
|------|-----------|-------------|
| `lucide_search` | `query` (string), `category?` (string), `limit?` (number) | Search by name or tags |
| `lucide_info` | `name` (string) | Full details for one icon |
| `lucide_list_categories` | — | All categories with counts |

---

## Data source

Bundled `data/icons.json` is built from the [Lucide GitHub repo](https://github.com/lucide-icons/lucide) icon metadata.

**To refresh with the latest icons:**

```bash
lucide update
# Uses git sparse-checkout — only downloads the icons/ dir (~500 KB)
```

**To use a local clone directly (always current):**

```bash
export LUCIDE_ICONS_PATH=~/repos/lucide/icons
lucide search heart  # reads directly from disk, no cache needed
```

---

## Why this exists

LLMs frequently hallucinate Lucide icon names (e.g. `CloudArrowUp` instead of `upload-cloud`).
With this tool:
- **You** can quickly look up the real name from the terminal while coding
- **Claude** (via MCP) can look up icon names itself before outputting code
