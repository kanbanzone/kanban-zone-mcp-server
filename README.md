# Kanban Zone MCP Server

[Model Context Protocol](https://modelcontextprotocol.io/) server that lets AI assistants (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, and any stdio-capable MCP client) drive your [Kanban Zone](https://kanbanzone.com) workspace via the public API.

23 tools across boards, cards, comments, checklists, and tasks. No delete operations.

## What you can do

- Read your boards, columns, labels, members, and custom fields.
- Create, list, get, update, and move cards.
- Inspect a card's history and time-in-column metrics.
- Add comments.
- Create, update, and list checklists — including bulk task creation in a single call.
- Create, update, and move tasks.

## Quick start (Claude Desktop)

1. **Get an API key.** In Kanban Zone: **Org Settings → Integrations → API Key**. Copy the whole thing — it looks like `accessId:apiKey`.

2. **Edit your config.**

   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

   ```json
   {
     "mcpServers": {
       "kanbanzone": {
         "command": "npx",
         "args": ["-y", "kanban-zone-mcp-server"],
         "env": {
           "KANBANZONE_API_KEY": "accessId:apiKey"
         }
       }
     }
   }
   ```

3. **Restart Claude Desktop.** The Kanban Zone tools appear in the tool picker.

4. **Try it.** Ask Claude: *"Is my Kanban Zone connection working?"* — Claude calls `kanbanzone_get_me` and replies with your org name.

## Quick start (Claude Code)

```bash
claude mcp add kanbanzone \
  -e KANBANZONE_API_KEY=accessId:apiKey \
  -- npx -y kanban-zone-mcp-server
```

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `KANBANZONE_API_KEY` | yes | — | Composite credential `accessId:apiKey`. Generate in **Org Settings → Integrations → API Key**. |
| `KANBANZONE_BASE_URL` | no | `https://integrations.kanbanzone.io/v1` | Override only when pointing at a non-production environment. |

The server validates the key on startup. A missing or malformed value (no `:` separator) exits immediately with a message pointing at the org settings page.

## Tools

23 tools, all prefixed with `kanbanzone_`:

| Group | Tools |
| --- | --- |
| **Organization & Auth** | `get_me`, `get_organization` |
| **Boards** | `list_boards`, `get_board`, `list_board_columns`, `list_board_labels`, `list_board_members`, `list_board_custom_fields` |
| **Cards** | `create_card`, `list_cards`, `get_card`, `update_card`, `move_card`, `get_card_history`, `get_card_metrics` |
| **Comments** | `create_comment`, `list_card_comments` |
| **Checklists** | `create_checklist`, `update_checklist`, `list_card_checklists` |
| **Tasks** | `create_task`, `update_task`, `move_task` |

User-facing docs with example prompts: <https://developer.kanbanzone.com/mcp>.
Full input/output schemas: <https://developer.kanbanzone.com/api>.

## Running from source

If you'd rather run from a local clone (development, contributions, custom modifications):

```bash
git clone https://github.com/kanbanzone/kanban-zone-mcp-server.git
cd kanban-zone-mcp-server
npm install
KANBANZONE_API_KEY=accessId:apiKey node src/index.js
```

Plain JavaScript — no compile step.

## Troubleshooting

**`401` on every tool call.** API key is wrong or expired. Regenerate it.

**Tools don't appear in the client.** Confirm the path is correct and the client was restarted after editing config. For `npx` installs, run `npx -y kanban-zone-mcp-server` once manually to make sure it downloads cleanly.

**`Card does not exist` on a card you can see.** It's a mirror — pass `board=<publicId>` to disambiguate which mirror.

**Truncation warnings on `list_cards`.** Paginate with `page` / `count`, or narrow with `columns`, `owner`, `label`, or `daysSinceLastUpdate`.

## Security

This server runs locally on your machine. It does not transmit data to any third-party AI service — every API call goes directly to `https://integrations.kanbanzone.io`. Your API key never leaves your machine except as an `Authorization: Basic` header on those direct calls.

## What's next

The server is local-stdio only today. A hosted version (paste a URL into your client, no install) is on the roadmap.

## License

[MIT](./LICENSE).
