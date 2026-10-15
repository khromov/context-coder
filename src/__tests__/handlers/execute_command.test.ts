import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { handleExecuteCommand } from '../../handlers/execute_command.js';
import { setupTestDir, cleanupTestDir, createTestContext, createTestFile } from './test-utils.js';

// Shell-syntax tests rely on /bin/sh and POSIX utilities (grep, tr, sleep)
const describePosix = process.platform === 'win32' ? describe.skip : describe;

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
    const result = await handleExecuteCommand(
      {
        command: process.platform === 'win32' ? 'timeout /t 5' : 'sleep 5',
        timeout: 100, // 100ms timeout
      },
      context
    );

    expect(result.content[0].text).toContain('=== killed by signal: SIGTERM ===');
  }, 10000); // Increase test timeout

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
      // Give the kernel a moment to reap the killed process
      await new Promise((r) => setTimeout(r, 100));
      expect(() => process.kill(sleepPid, 0)).toThrow();
    }, 10000);
  });
});
