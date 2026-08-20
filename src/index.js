#!/usr/bin/env node
/* eslint-disable no-console */
// Stdio entry point. The MCP SDK is ESM-only; everything else is CommonJS, so the SDK
// is dynamically imported inside main().

const { initApiClient } = require('./client');
const { registerAllTools } = require('./tools');
const { registerAllPrompts } = require('./prompts');
const { SERVER_NAME, SERVER_VERSION } = require('./constants');

const main = async () => {
    // Validate config before opening stdio so a missing/malformed key fails clean instead
    // of blowing up on every tool call later.
    try {
        initApiClient();
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }

    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    registerAllTools(server);
    registerAllPrompts(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // stdio convention: never log to stdout — it carries the MCP protocol.
    console.error(`${SERVER_NAME} v${SERVER_VERSION} running via stdio.`);
};

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
