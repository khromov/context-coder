import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import { handleReadFile } from '../../handlers/read_file.js';
import { setupTestDir, cleanupTestDir, createTestContext, createTestFile } from './test-utils.js';

// Creating symlinks on Windows needs extra privileges
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describe('handleReadFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await setupTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it('should read existing file content', async () => {
    const content = 'Hello, World!\nThis is a test file.';
    await createTestFile(testDir, 'test.txt', content);

    const context = createTestContext(testDir);
    const result = await handleReadFile({ path: './test.txt' }, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe(content);
  });

  it('should handle file not found error', async () => {
    const context = createTestContext(testDir);

    await expect(handleReadFile({ path: './nonexistent.txt' }, context)).rejects.toThrow('ENOENT');
  });

  it('should reject parent directory access', async () => {
    const context = createTestContext(testDir);

    await expect(handleReadFile({ path: '../outside.txt' }, context)).rejects.toThrow(
      'Path cannot contain parent directory references'
    );
  });

  describePosix('symlinks', () => {
    let outsideDir: string;

    beforeEach(async () => {
      outsideDir = await fs.mkdtemp(path.join(tmpdir(), 'coco-outside-'));
      await fs.writeFile(path.join(outsideDir, 'secret.txt'), 'outside the root');
    });

    afterEach(async () => {
      await fs.rm(outsideDir, { recursive: true, force: true });
    });

    it('should refuse to read through a symlink that leads outside the root', async () => {
      await fs.symlink(outsideDir, path.join(testDir, 'escape'));
      const context = createTestContext(testDir);

      await expect(handleReadFile({ path: 'escape/secret.txt' }, context)).rejects.toThrow(
        'Path leads outside the root directory through a symlink'
      );
    });

    it('should read through a symlink that stays inside the root', async () => {
      await createTestFile(testDir, 'real/notes.txt', 'inside the root');
      await fs.symlink(path.join(testDir, 'real'), path.join(testDir, 'alias'));
      const context = createTestContext(testDir);

      const result = await handleReadFile({ path: 'alias/notes.txt' }, context);
      expect(result.content[0].text).toBe('inside the root');
    });
  });
});
