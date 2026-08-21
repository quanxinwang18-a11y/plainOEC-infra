#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { redactSecrets } from './auth.mjs';
import { createE3McpServer } from './server.mjs';

const server = createE3McpServer();

server.connect(new StdioServerTransport()).catch((error) => {
  process.stderr.write(`E3 MCP server failed: ${redactSecrets(error.message)}\n`);
  process.exitCode = 1;
});
