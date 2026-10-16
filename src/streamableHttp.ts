import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createServer } from './mcp.js';
import { InMemoryEventStore } from './lib/in-memory-event-store.js';
import { getAllowedHostnames, getRequestRejection, isLoopbackHost } from './lib/host-validation.js';
import { DEFAULT_HOST, DEFAULT_PORT, getMode } from './constants.js';
import logger from './logger.js';
import { getVersion } from './lib/version.js';
import { killAllRunningCommands } from './handlers/execute_command.js';

const buildType = process.env.COCO_BUILD_TYPE || 'none';
const mode = getMode();
const version = getVersion();
logger.info(
  `Starting 🥥 Coco MCP Server v${version} (Streamable HTTP) using build type ${buildType} (${mode} mode)`
);

interface Session {
  transport: StreamableHTTPServerTransport;
  eventStore: InMemoryEventStore;
}

const sessions = new Map<string, Session>();

// Each session keeps the messages it sent, so a client that reconnects can be sent what it
// missed. That is only useful for a few minutes, so old events are dropped. Otherwise an idle
// session would hold every get_codebase page it returned for as long as the server runs.
const EVENT_STORE_MAX_EVENTS = 100;
const EVENT_STORE_MAX_AGE_MS = 5 * 60 * 1000;
const EVENT_STORE_PRUNE_INTERVAL_MS = 60 * 1000;

const pruneTimer = setInterval(() => {
  for (const { eventStore } of sessions.values()) {
    eventStore.prune();
  }
}, EVENT_STORE_PRUNE_INTERVAL_MS);
// Pruning alone shouldn't keep the process alive
pruneTimer.unref();

// Hostnames accepted in the Host and Origin headers, set when the server starts listening
let allowedHostnames = getAllowedHostnames(DEFAULT_HOST);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendJsonRpcError(res: ServerResponse, status: number, code: number, message: string) {
  sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
}

function getSession(req: IncomingMessage): Session | undefined {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  return sessionId ? sessions.get(sessionId) : undefined;
}

async function handleMcpPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  logger.debug('Received MCP POST request');
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        sendJsonRpcError(res, 400, -32000, 'Bad Request: No valid session ID provided');
        return;
      }
      // The existing transport is already connected to its server
      await session.transport.handleRequest(req, res);
      return;
    }

    // No session ID: this should be an initialize request, which starts a new session
    const { server, cleanup } = await createServer();
    const eventStore = new InMemoryEventStore({
      maxEvents: EVENT_STORE_MAX_EVENTS,
      maxAgeMs: EVENT_STORE_MAX_AGE_MS,
    });
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      eventStore, // Enable resumability
      onsessioninitialized: (newSessionId: string) => {
        // Store the transport by session ID when session is initialized
        // This avoids race conditions where requests might come in before the session is stored
        logger.info(`Session initialized with ID: ${newSessionId}`);
        sessions.set(newSessionId, { transport, eventStore });
      },
    });

    // Set up onclose handler to clean up the session when its transport closes
    server.onclose = async () => {
      const sid = transport.sessionId;
      if (sid && sessions.has(sid)) {
        logger.info(`Transport closed for session ${sid}, removing it from sessions`);
        sessions.delete(sid);
        await cleanup();
      }
    };

    // Connect the transport to the MCP server BEFORE handling the request
    // so responses can flow back through the same transport
    await server.connect(transport);
    await transport.handleRequest(req, res);

    // Without a session ID the transport only accepts initialize. If this request was
    // something else, no session started, so close the server created for it.
    if (!transport.sessionId) {
      await server.close();
    }
  } catch (error) {
    logger.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, -32603, 'Internal server error');
    }
  }
}

// Handle GET requests for SSE streams (using built-in support from StreamableHTTP)
async function handleMcpGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
  logger.debug('Received MCP GET request');
  const session = getSession(req);
  if (!session) {
    sendJsonRpcError(res, 400, -32000, 'Bad Request: No valid session ID provided');
    return;
  }

  // Check for Last-Event-ID header for resumability
  const lastEventId = req.headers['last-event-id'] as string | undefined;
  if (lastEventId) {
    logger.debug(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
  } else {
    logger.debug(`Establishing new SSE stream for session ${session.transport.sessionId}`);
  }

  await session.transport.handleRequest(req, res);
}

// Handle DELETE requests for session termination (according to MCP spec)
async function handleMcpDelete(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = getSession(req);
  if (!session) {
    sendJsonRpcError(res, 400, -32000, 'Bad Request: No valid session ID provided');
    return;
  }

  logger.info(`Received session termination request for session ${session.transport.sessionId}`);

  try {
    await session.transport.handleRequest(req, res);
  } catch (error) {
    logger.error('Error handling session termination:', error);
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, -32603, 'Error handling session termination');
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
    activeTransports: sessions.size,
  });
}

const httpServer = createHttpServer(async (req, res) => {
  try {
    // Only accept requests addressed to an allowed host, and from an allowed origin when a
    // browser sends one. This stops web pages from reaching the server through DNS rebinding.
    const rejection = getRequestRejection(req.headers.host, req.headers.origin, allowedHostnames);
    if (rejection) {
      logger.warn(`Rejected ${req.method} ${req.url}: ${rejection}`);
      sendJsonRpcError(res, 403, -32000, rejection);
      return;
    }

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

function warnAboutNetworkAccess(listenHost: string): void {
  const exposure =
    mode === 'full' ? 'use this server, including running commands in your project' : 'use it';
  const advice = process.env.COCO_BUILD_TYPE
    ? `In Docker, publish the port on 127.0.0.1 only (e.g. "127.0.0.1:3001:3001"); otherwise anyone on your network can ${exposure}.`
    : `Anyone who can reach this port over the network can ${exposure}.`;
  logger.warn(`⚠️ Listening on ${listenHost}, not only on this computer. ${advice}`);
}

/**
 * Start listening. The host comes from --host, then COCO_HOST, then 127.0.0.1, so by
 * default only programs on this computer can connect.
 */
export function startHttpServer(port?: number, host?: string): Promise<void> {
  const listenPort = port || Number(process.env.COCO_PORT) || DEFAULT_PORT;
  const listenHost = host || process.env.COCO_HOST || DEFAULT_HOST;
  allowedHostnames = getAllowedHostnames(listenHost);

  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      httpServer.off('listening', onListening);
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(
              `Port ${listenPort} is already in use on ${listenHost}. Stop the other process or choose another port with --port.`
            )
          : error
      );
    };
    const onListening = () => {
      httpServer.off('error', onError);
      logger.info(
        `🥥 Coco MCP Server listening on port ${listenPort} at ${listenHost} (${mode} mode)`
      );
      if (!isLoopbackHost(listenHost)) {
        warnAboutNetworkAccess(listenHost);
      }
      resolve();
    };

    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(listenPort, listenHost);
  });
}

// Handle server shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down 🥥 Coco server...');

  // Commands run in their own process group, so they must be killed explicitly
  killAllRunningCommands();

  // Close all active transports to properly clean up resources
  for (const [sessionId, { transport }] of sessions) {
    try {
      logger.debug(`Closing transport for session ${sessionId}`);
      await transport.close();
      sessions.delete(sessionId);
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
