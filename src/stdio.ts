#!/usr/bin/env node

import { StdioTransport } from '@tmcp/transport-stdio';
import { createServer } from './mcp.js';
import logger from './logger.js';
import { getVersion } from './lib/version.js';

// All logging MUST go to stderr in stdio mode
// stdout is reserved exclusively for MCP protocol messages

export async function startStdioServer(): Promise<void> {
  try {
    const { server, cleanup } = await createServer();

    // Create stdio transport
    const transport = new StdioTransport(server);

    // Handle graceful shutdown
    const handleShutdown = async () => {
      logger.info('Shutting down stdio server...');
      await cleanup();
      process.exit(0);
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);

    // Start listening (tmcp transports handle the connection automatically)
    transport.listen();

    // Log to stderr only - stdout is for MCP protocol
    const mode = process.env.CONTEXT_CODER_MODE || 'mini';
    const version = getVersion();
    logger.info(`🥥 Coco MCP Server v${version} running in stdio mode (${mode})`);
  } catch (error) {
    logger.error('Failed to start stdio server:', error);
    process.exit(1);
  }
}
