import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createPipelineMcpServer } from './server.mjs';

const server = createPipelineMcpServer();
await server.connect(new StdioServerTransport());
