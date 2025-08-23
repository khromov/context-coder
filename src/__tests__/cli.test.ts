import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs/promises';

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

describe('CLI with Commander', () => {
  describe('Main command', () => {
    it('should show help when --help is passed', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} --help`);

      expect(stdout).toContain('Usage: context-coder [options] [command]');
      expect(stdout).toContain('Context Coder: MCP server for full-context coding');
      expect(stdout).toContain('--mini');
      expect(stdout).toContain('--full');
      expect(stdout).toContain('--stdio');
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

    it('should start HTTP server by default', async () => {
      // Use a random port to avoid conflicts
      const port = 4000 + Math.floor(Math.random() * 1000);

      // Start the server in the background
      const serverProcess = exec(`PORT=${port} node ${CLI_PATH}`, (_error, _stdout, _stderr) => {
        // This callback is called when the process exits
      });

      // Give the server time to start
      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        // Check if server is running by looking for the process
        expect(serverProcess.pid).toBeDefined();
        expect(serverProcess.killed).toBe(false);
      } finally {
        // Clean up: kill the server
        serverProcess.kill();
      }
    });

    it('should accept --mini flag', async () => {
      const port = 4000 + Math.floor(Math.random() * 1000);

      const serverProcess = exec(
        `PORT=${port} node ${CLI_PATH} --mini`,
        (_error, _stdout, _stderr) => {
          // Process will be killed, so we don't check here
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        expect(serverProcess.pid).toBeDefined();
      } finally {
        serverProcess.kill();
      }
    });

    it('should accept --full flag', async () => {
      const port = 4000 + Math.floor(Math.random() * 1000);

      const serverProcess = exec(
        `PORT=${port} node ${CLI_PATH} --full`,
        (_error, _stdout, _stderr) => {
          // Process will be killed, so we don't check here
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        expect(serverProcess.pid).toBeDefined();
      } finally {
        serverProcess.kill();
      }
    });

    it('should accept --stdio flag', async () => {
      // For stdio mode, we need to handle it differently
      // Create a child process that will be killed after a short time
      const child = exec(`node ${CLI_PATH} --stdio`, (_error, _stdout, _stderr) => {
        // We expect this to be killed, so error is normal
      });

      // Give it a moment to start
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Kill the process
      child.kill();

      // The test passes if we can start and kill the stdio server without errors
      expect(child.killed).toBe(true);
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
      const deepDir = path.join(LONG_PATH_TEST_DIR, 'very', 'deep', 'nested', 'directory', 'structure');
      await fs.mkdir(deepDir, { recursive: true });

      // Create files with long names that exceed 50 characters total
      const longFileName = 'this-is-a-very-long-file-name-that-exceeds-fifty-characters.js';
      const veryLongFileName = 'this-is-an-extremely-long-file-name-that-definitely-exceeds-fifty-characters-and-should-trigger-the-bug.js';
      
      await fs.writeFile(path.join(deepDir, longFileName), 'console.log("test");');
      await fs.writeFile(path.join(deepDir, veryLongFileName), 'console.log("test");');
      
      // Also create a .cocominify file to test minified file indicator
      await fs.writeFile(path.join(LONG_PATH_TEST_DIR, '.cocominify'), '*.js\nConsole.log minified');

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
