import { HttpTransport } from '@tmcp/transport-http';
import { createServer } from 'http';
import { URL } from 'url';
import { createServer as createServer2 } from './mcp.js';
import logger from './logger.js';
import { getVersion } from './lib/version.js';

const buildType = process.env.COCO_BUILD_TYPE || 'none';
const mode = process.env.CONTEXT_CODER_MODE || 'mini';
const version = getVersion();
logger.info(
  `Starting 🥥 Coco MCP Server v${version} (HTTP) using build type ${buildType} (${mode} mode)`
);

// Store transport instance for cleanup
let transport: HttpTransport | null = null;

// Export function to start the server
export async function startHttpServer(port?: number): Promise<void> {
  const PORT = port || process.env.COCO_PORT || 3001;

  // Create the MCP server
  const { server, cleanup } = await createServer2();

  // Create HTTP transport
  transport = new HttpTransport(server);

  // Create Node.js HTTP server
  const httpServer = createServer(async (req, res) => {
    try {
      // Handle health check endpoint
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'healthy',
            version: getVersion(),
            mode: mode,
            buildType: buildType,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      // For all other requests, read the body first
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          // Create a standard Request object from the Node.js request
          const url = new URL(req.url || '/', `http://localhost:${PORT}`);
          const headers = new Headers();

          // Copy headers from Node.js request
          Object.entries(req.headers).forEach(([key, value]) => {
            if (typeof value === 'string') {
              headers.set(key, value);
            } else if (Array.isArray(value)) {
              headers.set(key, value.join(', '));
            }
          });

          const request = new Request(url.toString(), {
            method: req.method,
            headers: headers,
            body: req.method === 'POST' ? body : undefined,
          });

          // Get response from HttpTransport
          const response = await transport!.respond(request);

          // If response is null, the request wasn't for MCP
          if (response === null) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32601,
                  message: 'Method not found',
                },
                id: null,
              })
            );
            return;
          }

          // Copy response headers to Node.js response
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          res.statusCode = response.status;

          // Handle the response body
          if (response.body) {
            const reader = response.body.getReader();
            const pump = async (): Promise<void> => {
              try {
                const { done, value } = await reader.read();
                if (done) {
                  res.end();
                  return;
                }
                res.write(value);
                await pump();
              } catch (error) {
                logger.error('Error reading response stream:', error);
                if (!res.headersSent) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                }
                res.end(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    error: {
                      code: -32603,
                      message: 'Internal server error',
                    },
                    id: null,
                  })
                );
              }
            };
            await pump();
          } else {
            res.end();
          }
        } catch (error) {
          logger.error('Error processing request:', error);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
          }
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: 'Internal server error',
              },
              id: null,
            })
          );
        }
      });
    } catch (error) {
      logger.error('Error handling request:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        })
      );
    }
  });

  // Start the server
  httpServer.listen(PORT, () => {
    logger.info(`🥥 Coco MCP Server listening on port ${PORT} (${mode} mode)`);
  });

  // Handle server shutdown
  const gracefulShutdown = async () => {
    logger.info('Shutting down 🥥 Coco server...');

    // Close HTTP server
    httpServer.close(() => {
      logger.info('HTTP server closed');
    });

    // Cleanup MCP server
    await cleanup();

    logger.info('🥥 Coco server shutdown complete');
    process.exit(0);
  };

  // Handle both SIGINT (Ctrl+C) and SIGTERM (Docker stop)
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}
