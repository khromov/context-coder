#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './mcp.js';
import logger from './logger.js';
import { getVersion } from './lib/version.js';

// All logging MUST go to stderr in stdio mode
// stdout is reserved exclusively for MCP protocol messages

async function runStdioServer() {
  try {
    const { server, cleanup } = await createServer();

    // Create stdio transport
    const transport = new StdioServerTransport();

    // Handle graceful shutdown
    const handleShutdown = async () => {
      logger.info('Shutting down stdio server...');
      await cleanup();
      await transport.close();
      process.exit(0);
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);

    // Connect the server to the transport
    await server.connect(transport);

    // Log to stderr only - stdout is for MCP protocol
    const mode = process.env.CONTEXT_CODER_MODE || 'mini';
    const version = await getVersion();
    logger.info(`🥥 Coco MCP Server v${version} running in stdio mode (${mode})`);
  } catch (error) {
    logger.error('Failed to start stdio server:', error);
    process.exit(1);
  }
}

runStdioServer();
