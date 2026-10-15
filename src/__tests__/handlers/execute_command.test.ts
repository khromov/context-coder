import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import {
  handleExecuteCommand,
  killAllRunningCommands,
  getRunningCommandCount,
} from '../../handlers/execute_command.js';
import { setupTestDir, cleanupTestDir, createTestContext, createTestFile } from './test-utils.js';

const isWindows = process.platform === 'win32';
// These tests use /bin/sh syntax (single quotes, `&`, `$!`, `wait`) and POSIX utilities
// (grep, tr, sleep) that cmd.exe does not have; Windows equivalents are in 'cmd.exe syntax'
const describePosix = isWindows ? describe.skip : describe;
const describeWindows = isWindows ? describe : describe.skip;

// A command that runs for ~30s and whose grandchild (sleep / ping) holds stdout open,
// so it only finishes early if the whole process tree is killed
const LONG_COMMAND = isWindows ? 'ping -n 30 127.0.0.1' : 'sleep 30';

// Whether a process is still running. A killed process can linger as a zombie until it is
// reaped, and kill(pid, 0) succeeds on zombies, so on Linux also check the process state.
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  const statPath = `/proc/${pid}/stat`;
  if (existsSync(statPath)) {
    const state = readFileSync(statPath, 'utf-8').split(') ')[1]?.[0];
    return state !== 'Z' && state !== 'X';
  }
  return true;
}

async function waitForFile(filePath: string, timeoutMs = 5000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const content = (await fs.readFile(filePath, 'utf-8')).trim();
      if (content) {
        return content;
      }
    } catch {
      // Not written yet
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

describe('handleExecuteCommand', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await setupTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it('should execute successful command', async () => {
    const context = createTestContext(testDir);
    const result = await handleExecuteCommand(
      {
        command: 'echo Hello World',
      },
      context
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('=== stdout ===');
    expect(result.content[0].text).toContain('Hello World');
    expect(result.content[0].text).toContain('=== exit code: 0 ===');
  });

  it('should handle command failure', async () => {
    const context = createTestContext(testDir);
    const result = await handleExecuteCommand(
      {
        command: 'ls /nonexistent-directory-12345',
      },
      context
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('=== stderr ===');
    expect(result.content[0].text).not.toContain('=== exit code: 0 ===');
  });

  it('should execute command in the correct directory', async () => {
    // Create a test file in the directory
    await createTestFile(testDir, 'test.txt', 'test content');

    const context = createTestContext(testDir);
    const result = await handleExecuteCommand(
      {
        command: 'ls',
      },
      context
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('test.txt');
  });

  it('should handle command timeout', async () => {
    const context = createTestContext(testDir);
    const start = Date.now();
    const result = await handleExecuteCommand(
      {
        command: LONG_COMMAND,
        timeout: 200,
      },
      context
    );

    expect(Date.now() - start).toBeLessThan(5000);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('=== timed out after 200ms ===');
  }, 10000);

  it('should not report a timeout for a command that finishes in time', async () => {
    const context = createTestContext(testDir);
    const result = await handleExecuteCommand({ command: 'echo done', timeout: 5000 }, context);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).not.toContain('timed out');
  });

  it('should remove finished commands from the running registry', async () => {
    const context = createTestContext(testDir);
    const pending = handleExecuteCommand({ command: 'echo done' }, context);
    expect(getRunningCommandCount()).toBe(1);

    await pending;
    expect(getRunningCommandCount()).toBe(0);
  });

  it('should kill running commands with killAllRunningCommands', async () => {
    const context = createTestContext(testDir);
    const start = Date.now();
    const pending = handleExecuteCommand({ command: LONG_COMMAND, timeout: 60000 }, context);
    // Let the command start its grandchild before killing everything
    await new Promise((r) => setTimeout(r, 300));
    expect(getRunningCommandCount()).toBe(1);

    killAllRunningCommands();
    const result = await pending;

    expect(Date.now() - start).toBeLessThan(5000);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain('timed out');
    expect(getRunningCommandCount()).toBe(0);
  }, 10000);

  describeWindows('cmd.exe syntax', () => {
    it('should support double-quoted arguments', async () => {
      await createTestFile(testDir, 'notes.txt', 'hello brave new world\r\nhello world\r\n');
      const context = createTestContext(testDir);
      const result = await handleExecuteCommand(
        { command: 'findstr /C:"brave new" notes.txt' },
        context
      );

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('hello brave new world');
      // The line without the quoted phrase must not match
      expect(result.content[0].text).not.toMatch(/^hello world\r?$/m);
    });

    it('should support && chaining and %VAR% expansion', async () => {
      const context = createTestContext(testDir);
      const result = await handleExecuteCommand(
        {
          command: 'echo first&& echo value: %COCO_TEST_VAR%',
          env: { COCO_TEST_VAR: 'from-env' },
        },
        context
      );

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toMatch(/first\r?\nvalue: from-env/);
    });

    it('should report the timeout for a command with output redirected', async () => {
      const context = createTestContext(testDir);
      const start = Date.now();
      const result = await handleExecuteCommand(
        { command: 'ping -n 30 127.0.0.1 >NUL', timeout: 200 },
        context
      );

      expect(Date.now() - start).toBeLessThan(5000);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('=== timed out after 200ms ===');
    }, 10000);
  });

  describePosix('shell syntax', () => {
    it('should strip double quotes from arguments', async () => {
      await createTestFile(
        testDir,
        'DesktopApis.svelte',
        "<script>\nimport foo from 'bar';\n</script>\n"
      );
      const context = createTestContext(testDir);
      const result = await handleExecuteCommand(
        { command: 'grep -n "import" DesktopApis.svelte' },
        context
      );

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("2:import foo from 'bar';");
      expect(result.content[0].text).toContain('=== exit code: 0 ===');
    });

    it('should support quoted alternation patterns', async () => {
      await createTestFile(testDir, 'app.svelte', 'set_window_title();\nblur();\nother();\n');
      const context = createTestContext(testDir);
      const result = await handleExecuteCommand(
        { command: 'grep -oE "(set_window_title|activate_window|blur)" app.svelte' },
        context
      );

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('set_window_title\nblur');
      expect(result.content[0].text).toContain('=== exit code: 0 ===');
    });

    it('should keep single-quoted arguments containing spaces together', async () => {
      await createTestFile(testDir, 'notes.txt', 'hello brave new world\nhello world\n');
      const context = createTestContext(testDir);
      const result = await handleExecuteCommand(
        { command: "grep -c 'brave new' notes.txt" },
        context
      );

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('=== stdout ===\n1\n');
      expect(result.content[0].text).not.toContain('=== stderr ===');
    });

    it('should support pipes', async () => {
      const context = createTestContext(testDir);
      const result = await handleExecuteCommand({ command: 'echo hello | tr a-z A-Z' }, context);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('HELLO');
    });

    it('should support && chaining and env var expansion', async () => {
      const context = createTestContext(testDir);
      const result = await handleExecuteCommand(
        {
          command: 'echo first && echo "value: $COCO_TEST_VAR"',
          env: { COCO_TEST_VAR: 'from-env' },
        },
        context
      );

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('first\nvalue: from-env');
    });

    it('should support redirects and globs', async () => {
      await createTestFile(testDir, 'a.txt', 'a');
      await createTestFile(testDir, 'b.txt', 'b');
      const context = createTestContext(testDir);
      const result = await handleExecuteCommand(
        { command: 'ls *.txt > out.log && cat out.log' },
        context
      );

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('a.txt\nb.txt');
    });

    it('should report exit code 1 when grep finds no matches', async () => {
      await createTestFile(testDir, 'empty.txt', 'nothing here\n');
      const context = createTestContext(testDir);
      const result = await handleExecuteCommand({ command: 'grep "missing" empty.txt' }, context);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('=== exit code: 1 ===');
    });
  });

  describePosix('timeout', () => {
    it('should kill a long-running command and return promptly', async () => {
      const context = createTestContext(testDir);
      const start = Date.now();
      const result = await handleExecuteCommand({ command: 'sleep 30', timeout: 200 }, context);

      expect(Date.now() - start).toBeLessThan(3000);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('=== killed by signal: SIGTERM ===');
      expect(result.content[0].text).toContain('=== timed out after 200ms ===');
    }, 10000);

    it('should report a timeout even when the shell itself exits with 0', async () => {
      const context = createTestContext(testDir);
      // The shell exits right away, but the background job keeps stdout open until it is killed
      const result = await handleExecuteCommand(
        { command: 'sleep 30 & echo started', timeout: 300 },
        context
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('started');
      expect(result.content[0].text).toContain('=== exit code: 0 ===');
      expect(result.content[0].text).toContain('=== timed out after 300ms ===');
    }, 10000);

    it('should kill grandchild processes started by the shell', async () => {
      const context = createTestContext(testDir);
      const start = Date.now();
      // `sleep` runs as a grandchild holding stdout open; killing only the shell would hang
      const result = await handleExecuteCommand(
        { command: 'sleep 30 & echo $! > sleep.pid; wait', timeout: 200 },
        context
      );

      expect(Date.now() - start).toBeLessThan(3000);
      expect(result.isError).toBe(true);

      const sleepPid = Number((await fs.readFile(path.join(testDir, 'sleep.pid'), 'utf-8')).trim());
      expect(sleepPid).toBeGreaterThan(0);
      // Give the kernel a moment to deliver the signal
      await new Promise((r) => setTimeout(r, 100));
      expect(isProcessRunning(sleepPid)).toBe(false);
    }, 10000);

    it('should kill the whole process tree of running commands on shutdown', async () => {
      const context = createTestContext(testDir);
      const pidFile = path.join(testDir, 'sleep.pid');
      const pending = handleExecuteCommand(
        { command: 'sleep 30 & echo $! > sleep.pid; wait', timeout: 60000 },
        context
      );
      const sleepPid = Number(await waitForFile(pidFile));
      expect(isProcessRunning(sleepPid)).toBe(true);

      killAllRunningCommands();
      const result = await pending;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('=== killed by signal: SIGKILL ===');
      await new Promise((r) => setTimeout(r, 100));
      expect(isProcessRunning(sleepPid)).toBe(false);
    }, 10000);
  });
});
