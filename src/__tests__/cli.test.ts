import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs/promises';
import http from 'http';
import net from 'net';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the CLI script
const CLI_PATH = path.join(__dirname, '..', '..', 'dist', 'index.js');

// Helper function to run command and capture both stdout and stderr
async function runCommand(
  command: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        code: error ? error.code || 1 : 0,
      });
    });
  });
}

// Environment for spawned servers, without settings from the developer's shell that
// would change where or how they listen
function serverEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    COCO_MCP_TRANSPORT: 'http',
    COCO_DEV: 'true',
  };
  delete env.COCO_HOST;
  delete env.COCO_PORT;
  delete env.COCO_ALLOWED_HOSTS;
  delete env.CONTEXT_CODER_MODE;
  return env;
}

// Ask the OS for a free port, skipping the default, which a locally running server may use
async function getFreePort(): Promise<number> {
  for (;;) {
    const port = await new Promise<number>((resolve, reject) => {
      const srv = net.createServer();
      srv.unref();
      srv.on('error', reject);
      srv.listen(0, '127.0.0.1', () => {
        const { port } = srv.address() as net.AddressInfo;
        srv.close(() => resolve(port));
      });
    });
    if (port !== 3001) return port;
  }
}

interface RunningServer {
  child: ChildProcess;
  output: () => string;
}

// Start the HTTP server and resolve once it reports that it is listening
function startServer(args: string[]): Promise<RunningServer> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: serverEnv(),
    });
    let output = '';
    let started = false;

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start within 10 seconds:\n${output}`));
    }, 10000);

    const onData = (data: Buffer) => {
      output += data.toString();
      if (!started && output.includes('listening on port')) {
        started = true;
        clearTimeout(timeout);
        resolve({ child, output: () => output });
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (!started) {
        reject(new Error(`Server exited with code ${code} before listening:\n${output}`));
      }
    });
  });
}

// Stop a server, force-killing it if it hasn't exited after 2 seconds
async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => {
    const forceKill = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 2000);
    child.once('exit', () => {
      clearTimeout(forceKill);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function getHealth(port: number): Promise<{ status: string; mode: string }> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: '/health', agent: false }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

describe('CLI with Commander', () => {
  describe('Main command', () => {
    it('should show help when --help is passed', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} --help`);

      expect(stdout).toContain('Usage: context-coder [options] [command]');
      expect(stdout).toContain('Context Coder: MCP server for full-context coding');
      expect(stdout).toContain('--mini');
      expect(stdout).toContain('--full');
      expect(stdout).toContain('--stdio');
      expect(stdout).toContain('--host');
      expect(stdout).toContain('--allowed-hosts');
      expect(stdout).toContain('Commands:');
      expect(stdout).toContain('ls [options]');
    });

    it('should show version when --version is passed', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} --version`);

      // Extract version number from output (might have debug logs)
      const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
      expect(versionMatch).toBeTruthy();
      expect(versionMatch![1]).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should start an HTTP server in full mode on 127.0.0.1 by default', async () => {
      const port = await getFreePort();
      const { child, output } = await startServer(['--port', String(port)]);

      try {
        expect(output()).toContain(`listening on port ${port} at 127.0.0.1`);
        const health = await getHealth(port);
        expect(health.status).toBe('healthy');
        expect(health.mode).toBe('full');
      } finally {
        await stopServer(child);
      }
    }, 15000);

    it('should start in mini mode with --mini', async () => {
      const port = await getFreePort();
      const { child } = await startServer(['--port', String(port), '--mini']);

      try {
        expect((await getHealth(port)).mode).toBe('mini');
      } finally {
        await stopServer(child);
      }
    }, 15000);

    it('should start in full mode with --full', async () => {
      const port = await getFreePort();
      const { child } = await startServer(['--port', String(port), '--full']);

      try {
        expect((await getHealth(port)).mode).toBe('full');
      } finally {
        await stopServer(child);
      }
    }, 15000);

    it('should exit with a clear message when the port is already in use', async () => {
      const blocker = net.createServer();
      const port = await new Promise<number>((resolve) => {
        blocker.listen(0, '127.0.0.1', () => resolve((blocker.address() as net.AddressInfo).port));
      });

      try {
        const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
          const child = spawn('node', [CLI_PATH, '--port', String(port)], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: serverEnv(),
          });
          let output = '';
          child.stdout?.on('data', (data) => (output += data.toString()));
          child.stderr?.on('data', (data) => (output += data.toString()));
          child.on('exit', (code) => resolve({ code, output }));
        });

        expect(result.code).toBe(1);
        expect(result.output).toContain(`Port ${port} is already in use`);
      } finally {
        await new Promise((resolve) => blocker.close(resolve));
      }
    }, 15000);

    it('should keep running with --stdio', async () => {
      const child = spawn('node', [CLI_PATH, '--stdio', '--mini'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...serverEnv(), COCO_MCP_TRANSPORT: 'stdio' },
      });

      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        // Still running: it is waiting for MCP messages on stdin
        expect(child.exitCode).toBeNull();
      } finally {
        await stopServer(child);
      }
    });

    it('should reject a port that is not a positive whole number', async () => {
      const result = await runCommand(`node ${CLI_PATH} --port abc`);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('is invalid');
    });

    it('should handle unknown arguments', async () => {
      const result = await runCommand(`node ${CLI_PATH} --unknown-option`);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('error: unknown option');
    });
  });

  describe('ls subcommand', () => {
    const TEST_DIR = path.join(__dirname, 'test-ls-temp');

    beforeAll(async () => {
      // Create test directory with some files
      await fs.mkdir(TEST_DIR, { recursive: true });
      await fs.writeFile(path.join(TEST_DIR, 'large.js'), 'x'.repeat(5000));
      await fs.writeFile(path.join(TEST_DIR, 'medium.js'), 'y'.repeat(2000));
      await fs.writeFile(path.join(TEST_DIR, 'small.js'), 'z'.repeat(500));
    });

    afterAll(async () => {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    it('should show help for ls command', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} ls --help`);

      expect(stdout).toContain('Usage: context-coder ls [options]');
      expect(stdout).toContain('List all files that will be included in the codebase analysis');
      expect(stdout).toContain('--sort-by <type>');
      expect(stdout).toContain('--reverse');
      expect(stdout).toContain('--directory <dir>');
    });

    it('should list files with default settings', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} ls --directory ${TEST_DIR}`);

      expect(stdout).toContain('📋 Listing files in:');
      expect(stdout).toContain('📊 Summary:');
      expect(stdout).toContain('Total files: 3');
      expect(stdout).toContain('large.js');
      expect(stdout).toContain('medium.js');
      expect(stdout).toContain('small.js');

      // Default sort is by size descending, so large should be first
      const lines = stdout.split('\n');
      const fileLines = lines.filter((l) => l.includes('.js'));
      expect(fileLines[0]).toContain('large.js');
      expect(fileLines[2]).toContain('small.js');
    });

    it('should sort by path when specified', async () => {
      const { stdout } = await execAsync(
        `node ${CLI_PATH} ls --directory ${TEST_DIR} --sort-by path`
      );

      const lines = stdout.split('\n');
      const fileLines = lines.filter((l) => l.includes('.js'));

      // Alphabetical order: large, medium, small
      expect(fileLines[0]).toContain('large.js');
      expect(fileLines[1]).toContain('medium.js');
      expect(fileLines[2]).toContain('small.js');
    });

    it('should reverse sort order with --reverse flag', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} ls --directory ${TEST_DIR} --reverse`);

      const lines = stdout.split('\n');
      const fileLines = lines.filter((l) => l.includes('.js'));

      // Reverse size order: small should be first
      expect(fileLines[0]).toContain('small.js');
      expect(fileLines[2]).toContain('large.js');
    });

    it('should accept -r as alias for --reverse', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} ls --directory ${TEST_DIR} -r`);

      const lines = stdout.split('\n');
      const fileLines = lines.filter((l) => l.includes('.js'));

      // Reverse size order: small should be first
      expect(fileLines[0]).toContain('small.js');
    });

    it('should use current directory by default', async () => {
      const { stdout } = await execAsync(`cd ${TEST_DIR} && node ${CLI_PATH} ls`);

      expect(stdout).toContain('Total files: 3');
      expect(stdout).toContain('large.js');
    });

    it('should handle non-existent directory gracefully', async () => {
      // Use a unique directory name that definitely doesn't exist
      const nonExistentDir = `/tmp/definitely-does-not-exist-${Date.now()}`;

      const result = await runCommand(`node ${CLI_PATH} ls --directory ${nonExistentDir}`);

      // The command should succeed but show 0 files
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Total files: 0');
      expect(result.stdout).toContain('📋 Listing files in:');
    });

    it('should handle files with very long paths without crashing', async () => {
      const LONG_PATH_TEST_DIR = path.join(__dirname, 'test-long-path-temp');

      // Create nested directory structure to generate long paths
      const deepDir = path.join(
        LONG_PATH_TEST_DIR,
        'very',
        'deep',
        'nested',
        'directory',
        'structure'
      );
      await fs.mkdir(deepDir, { recursive: true });

      // Create files with long names that exceed 50 characters total
      const longFileName = 'this-is-a-very-long-file-name-that-exceeds-fifty-characters.js';
      const veryLongFileName =
        'this-is-an-extremely-long-file-name-that-definitely-exceeds-fifty-characters-and-should-trigger-the-bug.js';

      await fs.writeFile(path.join(deepDir, longFileName), 'console.log("test");');
      await fs.writeFile(path.join(deepDir, veryLongFileName), 'console.log("test");');

      // Also create a .cocominify file to test minified file indicator
      await fs.writeFile(
        path.join(LONG_PATH_TEST_DIR, '.cocominify'),
        '*.js\nConsole.log minified'
      );

      try {
        const result = await runCommand(`node ${CLI_PATH} ls --directory ${LONG_PATH_TEST_DIR}`);

        // The command should complete successfully (exit code 0)
        expect(result.code).toBe(0);
        expect(result.stderr).toBe('');

        // Should contain standard output elements
        expect(result.stdout).toContain('📋 Listing files in:');
        expect(result.stdout).toContain('📊 Summary:');
        expect(result.stdout).toContain('Total files:');

        // Should list both files without crashing
        expect(result.stdout).toContain(longFileName);
        expect(result.stdout).toContain(veryLongFileName);

        // Should handle minified files indicator correctly
        expect(result.stdout).toContain('Using minify file: .cocominify');
        expect(result.stdout).toContain('M = File content has been minified');
      } finally {
        // Clean up
        await fs.rm(LONG_PATH_TEST_DIR, { recursive: true, force: true });
      }
    });
  });

  describe('Unknown commands', () => {
    it('should show error for unknown command', async () => {
      const result = await runCommand(`node ${CLI_PATH} unknown-command`);

      expect(result.code).toBe(1);
      // Commander treats unknown commands as arguments, which is why we get "too many arguments"
      // This is acceptable behavior for our use case
      expect(result.stderr).toContain('error:');
    });
  });

  describe('Combined flags and commands', () => {
    it('should not interfere when server flags are passed with ls command', async () => {
      const TEST_DIR = path.join(__dirname, 'test-combined-temp');
      await fs.mkdir(TEST_DIR, { recursive: true });
      await fs.writeFile(path.join(TEST_DIR, 'test.js'), 'test');

      try {
        // The ls command should work regardless of server flags
        const { stdout } = await execAsync(`node ${CLI_PATH} ls --directory ${TEST_DIR} --mini`);

        // Should still work and list files
        expect(stdout).toContain('Total files: 1');
        expect(stdout).toContain('test.js');
      } finally {
        await fs.rm(TEST_DIR, { recursive: true, force: true });
      }
    });
  });
});
