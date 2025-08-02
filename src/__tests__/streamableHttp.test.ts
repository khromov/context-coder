import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('HTTP Server Integration Tests', () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const startServerOnPort = (port: number): Promise<{ process: ChildProcess; baseUrl: string }> => {
    return new Promise((resolve, reject) => {
      const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.js');
      const serverProcess = spawn('node', [indexPath, '--mini', '--port', port.toString()], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          COCO_MCP_TRANSPORT: 'http',
          CONTEXT_CODER_MODE: 'mini',
          COCO_DEV: 'true',
        },
      });

      let startupComplete = false;
      let errorData = '';

      const timeout = setTimeout(() => {
        if (!serverProcess.killed) {
          serverProcess.kill('SIGTERM');
        }
        reject(new Error(`Server startup timeout on port ${port}\nServer output:\n${errorData}`));
      }, 10000);

      serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        errorData += output;
      });

      serverProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        errorData += output;

        // Look for the startup message (goes to stdout)
        if (output.includes(`listening on port ${port}`)) {
          startupComplete = true;
          clearTimeout(timeout);
          resolve({
            process: serverProcess,
            baseUrl: `http://localhost:${port}`,
          });
        }
      });

      serverProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start server: ${error.message}`));
      });

      serverProcess.on('exit', (code) => {
        clearTimeout(timeout);
        if (!startupComplete) {
          reject(new Error(`Server exited early with code ${code}\nStderr: ${errorData}`));
        }
      });
    });
  };

  const sendHttpRequest = async (
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {}
  ): Promise<{ status: number; headers: Record<string, string>; data: any }> => {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...options.headers,
        },
      };

      const req = http.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const responseHeaders: Record<string, string> = {};
            Object.entries(res.headers).forEach(([key, value]) => {
              responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value || '';
            });

            resolve({
              status: res.statusCode || 0,
              headers: responseHeaders,
              data: data ? JSON.parse(data) : {},
            });
          } catch {
            resolve({
              status: res.statusCode || 0,
              headers: Object.fromEntries(
                Object.entries(res.headers).map(([k, v]) => [
                  k,
                  Array.isArray(v) ? v.join(', ') : v || '',
                ])
              ),
              data: data,
            });
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  };

  it('should start HTTP server and bind to specified port', async () => {
    const port = 3001 + Math.floor(Math.random() * 1000); // Random port to avoid conflicts
    const { process: serverProcess, baseUrl } = await startServerOnPort(port);

    try {
      // Test that the server is actually listening
      const response = await sendHttpRequest(`${baseUrl}/health`);
      expect(response.status).toBe(200);

      expect(response.data).toHaveProperty('status', 'healthy');
      expect(response.data).toHaveProperty('mode', 'mini');
      expect(response.data).toHaveProperty('version');
    } finally {
      serverProcess.kill('SIGTERM');

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        serverProcess.on('exit', () => resolve());
        setTimeout(() => resolve(), 1000); // Fallback timeout
      });
    }
  }, 15000);

  it('should handle MCP initialize request over HTTP', async () => {
    const port = 3001 + Math.floor(Math.random() * 1000);
    const { process: serverProcess, baseUrl } = await startServerOnPort(port);

    try {
      const initializeRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            roots: { listChanged: true },
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      };

      const response = await sendHttpRequest(`${baseUrl}/mcp`, {
        method: 'POST',
        body: JSON.stringify(initializeRequest),
      });

      expect(response.status).toBe(200);
      // StreamableHTTP returns SSE format for initialize
      expect(response.headers['content-type']).toContain('text/event-stream');

      // tmcp's HTTP transport provides session ID in headers, not necessarily a full response body
      const sessionId = response.headers['mcp-session-id'];
      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe('string');

      // The response should contain SSE data
      const sseData = response.data;
      expect(typeof sseData).toBe('string');
      expect(sseData).toContain('data: ');

      // Extract JSON from SSE format - handle multiple data lines
      const dataLines = sseData.split('\n').filter((line) => line.startsWith('data: '));
      expect(dataLines.length).toBeGreaterThan(0);
      
      // Find the response (not the roots/list notification)
      let jsonData = null;
      for (const dataLine of dataLines) {
        const parsed = JSON.parse(dataLine.substring(6)); // Remove 'data: '
        // Skip notifications/requests (they have 'method' field)
        if (!parsed.method && parsed.id === 1) {
          jsonData = parsed;
          break;
        }
      }
      expect(jsonData).toBeTruthy();

      expect(jsonData).toHaveProperty('jsonrpc', '2.0');
      expect(jsonData).toHaveProperty('id', 1);
      expect(jsonData).toHaveProperty('result');
      expect(jsonData.result).toHaveProperty('protocolVersion');
      expect(jsonData.result).toHaveProperty('serverInfo');
      expect(jsonData.result.serverInfo).toHaveProperty('name', 'context-coder');
    } finally {
      serverProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        serverProcess.on('exit', () => resolve());
        setTimeout(() => resolve(), 1000);
      });
    }
  }, 15000);

  it('should handle tools/list request over HTTP with session', async () => {
    const port = 3001 + Math.floor(Math.random() * 1000);
    const { process: serverProcess, baseUrl } = await startServerOnPort(port);

    try {
      // First initialize to get session ID
      const initResponse = await sendHttpRequest(`${baseUrl}/mcp`, {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      });

      expect(initResponse.status).toBe(200);
      const sessionId = initResponse.headers['mcp-session-id'];
      expect(sessionId).toBeTruthy();

      // Now request tools list with session ID
      const toolsResponse = await sendHttpRequest(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'mcp-session-id': sessionId!,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        }),
      });

      expect(toolsResponse.status).toBe(200);

      // Parse SSE data for tools response
      const toolsSseData = toolsResponse.data;
      expect(typeof toolsSseData).toBe('string');
      const toolsDataLines = toolsSseData.split('\n').filter((line) => line.startsWith('data: '));
      expect(toolsDataLines.length).toBeGreaterThan(0);
      
      // Find the response (not notifications)
      let toolsJsonData = null;
      for (const dataLine of toolsDataLines) {
        const parsed = JSON.parse(dataLine.substring(6));
        if (!parsed.method && parsed.id === 2) {
          toolsJsonData = parsed;
          break;
        }
      }
      expect(toolsJsonData).toBeTruthy();

      expect(toolsJsonData).toHaveProperty('jsonrpc', '2.0');
      expect(toolsJsonData).toHaveProperty('id', 2);
      expect(toolsJsonData).toHaveProperty('result');
      expect(toolsJsonData.result).toHaveProperty('tools');
      expect(Array.isArray(toolsJsonData.result.tools)).toBe(true);

      // Should have mini mode tools
      const toolNames = toolsJsonData.result.tools.map((tool: any) => tool.name);
      expect(toolNames).toContain('get_codebase_size');
      expect(toolNames).toContain('get_codebase');
      expect(toolNames).toContain('get_codebase_top_largest_files');
    } finally {
      serverProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        serverProcess.on('exit', () => resolve());
        setTimeout(() => resolve(), 1000);
      });
    }
  }, 15000);

  it('should handle SSE stream connections', async () => {
    const port = 3001 + Math.floor(Math.random() * 1000);
    const { process: serverProcess, baseUrl } = await startServerOnPort(port);

    try {
      // First establish session
      const initResponse = await sendHttpRequest(`${baseUrl}/mcp`, {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      });

      // Extract session ID from SSE format
      const initSseData = initResponse.data;
      const initDataLines = initSseData
        .split('\n')
        .filter((line: string) => line.startsWith('data: '));
      expect(initDataLines.length).toBeGreaterThan(0);
      
      // Find the initialize response (not notifications)
      let initDataLine = null;
      for (const dataLine of initDataLines) {
        const parsed = JSON.parse(dataLine.substring(6));
        if (!parsed.method && parsed.id === 1) {
          initDataLine = dataLine;
          break;
        }
      }
      expect(initDataLine).toBeTruthy();

      expect(initResponse.status).toBe(200);
      expect(initResponse.headers['content-type']).toContain('text/event-stream');
      expect(initResponse.headers['cache-control']).toBe('no-cache');
      expect(initResponse.headers['connection']).toBe('keep-alive');

      // For StreamableHTTP, the initialize response itself confirms SSE is working
      // No need to make additional GET requests since all communication happens over POST with SSE responses
    } finally {
      serverProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        serverProcess.on('exit', () => resolve());
        setTimeout(() => resolve(), 1000);
      });
    }
  }, 15000);

  it('should handle requests with any session ID', async () => {
    const port = 3001 + Math.floor(Math.random() * 1000);
    const { process: serverProcess, baseUrl } = await startServerOnPort(port);

    try {
      // tmcp's HTTP transport accepts any session ID and processes requests normally
      const response = await sendHttpRequest(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'mcp-session-id': 'any-session-id',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');

      // Parse SSE data for tools response
      const sseData = response.data;
      expect(typeof sseData).toBe('string');
      const dataLines = sseData.split('\n').filter((line) => line.startsWith('data: '));
      expect(dataLines.length).toBeGreaterThan(0);
      
      // Find the response (not notifications)
      let jsonData = null;
      for (const dataLine of dataLines) {
        const parsed = JSON.parse(dataLine.substring(6));
        if (!parsed.method && parsed.id === 1) {
          jsonData = parsed;
          break;
        }
      }
      expect(jsonData).toBeTruthy();

      expect(jsonData).toHaveProperty('jsonrpc', '2.0');
      expect(jsonData).toHaveProperty('id', 1);
      expect(jsonData).toHaveProperty('result');
      expect(jsonData.result).toHaveProperty('tools');
      expect(Array.isArray(jsonData.result.tools)).toBe(true);
    } finally {
      serverProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        serverProcess.on('exit', () => resolve());
        setTimeout(() => resolve(), 1000);
      });
    }
  }, 15000);
});
