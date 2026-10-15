import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from './mcp.js';
import { randomUUID } from 'node:crypto';
import logger from './logger.js';
import { getVersion } from './lib/version.js';
import { killAllRunningCommands } from './handlers/execute_command.js';

const buildType = process.env.COCO_BUILD_TYPE || 'none';
const mode = process.env.CONTEXT_CODER_MODE || 'mini';
const version = getVersion();
logger.info(
  `Starting 🥥 Coco MCP Server v${version} (Streamable HTTP) using build type ${buildType} (${mode} mode)`
);

const transports: Map<string, StreamableHTTPServerTransport> = new Map<
  string,
  StreamableHTTPServerTransport
>();

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handleMcpPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  logger.debug('Received MCP POST request');
  try {
    // Check for existing session ID
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport
      transport = transports.get(sessionId)!;
    } else if (!sessionId) {
      const { server, cleanup } = await createServer();

      // New initialization request
      const eventStore = new InMemoryEventStore();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        eventStore, // Enable resumability
        onsessioninitialized: (sessionId: string) => {
          // Store the transport by session ID when session is initialized
          // This avoids race conditions where requests might come in before the session is stored
          logger.info(`Session initialized with ID: ${sessionId}`);
          transports.set(sessionId, transport);
        },
      });

      // Set up onclose handler to clean up transport when closed
      server.onclose = async () => {
        const sid = transport.sessionId;
        if (sid && transports.has(sid)) {
          logger.info(`Transport closed for session ${sid}, removing from transports map`);
          transports.delete(sid);
          await cleanup();
        }
      };

      // Connect the transport to the MCP server BEFORE handling the request
      // so responses can flow back through the same transport
      await server.connect(transport);

      await transport.handleRequest(req, res);
      return; // Already handled
    } else {
      // Invalid request - no session ID or not initialization request
      sendJson(res, 400, {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    // Handle the request with existing transport - no need to reconnect
    // The existing transport is already connected to the server
    await transport.handleRequest(req, res);
  } catch (error) {
    logger.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      sendJson(res, 500, {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
      return;
    }
  }
}

// Handle GET requests for SSE streams (using built-in support from StreamableHTTP)
async function handleMcpGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
  logger.debug('Received MCP GET request');
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    sendJson(res, 400, {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  // Check for Last-Event-ID header for resumability
  const lastEventId = req.headers['last-event-id'] as string | undefined;
  if (lastEventId) {
    logger.debug(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
  } else {
    logger.debug(`Establishing new SSE stream for session ${sessionId}`);
  }

  const transport = transports.get(sessionId);
  await transport!.handleRequest(req, res);
}

// Handle DELETE requests for session termination (according to MCP spec)
async function handleMcpDelete(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    sendJson(res, 400, {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  logger.info(`Received session termination request for session ${sessionId}`);

  try {
    const transport = transports.get(sessionId);
    await transport!.handleRequest(req, res);
  } catch (error) {
    logger.error('Error handling session termination:', error);
    if (!res.headersSent) {
      sendJson(res, 500, {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Error handling session termination',
        },
        id: null,
      });
      return;
    }
  }
}

// Health check endpoint
function handleHealth(res: ServerResponse): void {
  sendJson(res, 200, {
    status: 'healthy',
    version: getVersion(),
    mode: mode,
    buildType: buildType,
    timestamp: new Date().toISOString(),
    activeTransports: transports.size,
  });
}

const httpServer = createHttpServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === '/mcp' && req.method === 'POST') {
      await handleMcpPost(req, res);
    } else if (pathname === '/mcp' && req.method === 'GET') {
      await handleMcpGet(req, res);
    } else if (pathname === '/mcp' && req.method === 'DELETE') {
      await handleMcpDelete(req, res);
    } else if (pathname === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      handleHealth(res);
    } else {
      sendJson(res, 404, { error: `Cannot ${req.method} ${pathname}` });
    }
  } catch (error) {
    logger.error(`Error handling ${req.method} ${req.url}:`, error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    }
  }
});

// Export function to start the server
export async function startHttpServer(port?: number): Promise<void> {
  const PORT = port || process.env.COCO_PORT || 3001;
  httpServer.listen(PORT, () => {
    logger.info(`🥥 Coco MCP Server listening on port ${PORT} (${mode} mode)`);
  });
}

// Handle server shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down 🥥 Coco server...');

  // Commands run in their own process group, so they must be killed explicitly
  killAllRunningCommands();

  // Close all active transports to properly clean up resources
  for (const sessionId in transports) {
    try {
      logger.debug(`Closing transport for session ${sessionId}`);
      await transports.get(sessionId)!.close();
      transports.delete(sessionId);
    } catch (error) {
      logger.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }

  logger.info('🥥 Coco server shutdown complete');
  process.exit(0);
};

// Handle SIGINT (Ctrl+C), SIGTERM (Docker stop) and SIGHUP (terminal closed)
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGHUP', gracefulShutdown);
// Last resort for any other exit path, so running commands are never orphaned
process.on('exit', killAllRunningCommands);
