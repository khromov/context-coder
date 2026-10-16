import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { handleExecuteCommand } from '../../handlers/execute_command.js';
import { setupTestDir, cleanupTestDir, createTestContext } from './test-utils.js';

// These tests use POSIX shell syntax
const describePosix = process.platform === 'win32' ? describe.skip : describe;
const describeMac = process.platform === 'darwin' ? describe : describe.skip;

describePosix('handleExecuteCommand shell', () => {
  let testDir: string;
  let originalShell: string | undefined;

  beforeEach(async () => {
    testDir = await setupTestDir();
    originalShell = process.env.COCO_SHELL;
    delete process.env.COCO_SHELL;
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
    if (originalShell !== undefined) {
      process.env.COCO_SHELL = originalShell;
    } else {
      delete process.env.COCO_SHELL;
    }
  });

  it('should handle quotes in a here-document inside $(...), as in git commit -m "$(cat <<\'EOF\' ...)"', async () => {
    // bash 3.2 (macOS's /bin/sh) fails to parse this: the apostrophe and backticks in the
    // here-document are taken as unclosed quotes
    const command = [
      "message=$(cat <<'EOF'",
      "It didn't break with `code` in it.",
      'EOF',
      ')',
      'printf "%s\\n" "$message"',
    ].join('\n');

    const result = await handleExecuteCommand({ command }, createTestContext(testDir));

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("It didn't break with `code` in it.");
  });

  it('should run commands through COCO_SHELL when it is set', async () => {
    process.env.COCO_SHELL = '/bin/sh';

    const result = await handleExecuteCommand({ command: 'echo $0' }, createTestContext(testDir));

    expect(result.content[0].text).toContain('=== stdout ===\n/bin/sh\n');
  });

  describeMac('on macOS', () => {
    it('should run commands through zsh emulating sh by default', async () => {
      const result = await handleExecuteCommand(
        { command: 'echo $0; v="a b"; set -- $v; echo "words: $#"; echo {x,y}' },
        createTestContext(testDir)
      );

      // sh behavior (word splitting) with brace expansion, as /bin/sh (bash 3.2) had
      expect(result.content[0].text).toContain('/bin/zsh\nwords: 2\nx y\n');
    });
  });
});
