import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import { handleWriteFile } from '../../handlers/write_file.js';
import {
  setupTestDir,
  cleanupTestDir,
  createTestContext,
  fileExists,
  readTestFile,
  createTestFile,
} from './test-utils.js';

// Creating symlinks on Windows needs extra privileges
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describe('handleWriteFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await setupTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it('should create a new file', async () => {
    const context = createTestContext(testDir);
    const content = 'This is new file content';

    const result = await handleWriteFile({ path: './newfile.txt', content }, context);

    expect(result.content[0].text).toBe('Successfully wrote to newfile.txt');
    expect(await fileExists(testDir, 'newfile.txt')).toBe(true);
    expect(await readTestFile(testDir, 'newfile.txt')).toBe(content);
  });

  it('should overwrite existing file', async () => {
    await createTestFile(testDir, 'existing.txt', 'old content');

    const context = createTestContext(testDir);
    const newContent = 'new content';

    const result = await handleWriteFile({ path: './existing.txt', content: newContent }, context);

    expect(result.content[0].text).toBe('Successfully wrote to existing.txt');
    expect(await readTestFile(testDir, 'existing.txt')).toBe(newContent);
  });

  it('should create file in nested directory', async () => {
    const context = createTestContext(testDir);
    const content = 'nested file content';

    const result = await handleWriteFile({ path: './deeply/nested/file.txt', content }, context);

    expect(result.content[0].text).toBe('Successfully wrote to deeply/nested/file.txt');
    expect(await fileExists(testDir, 'deeply/nested/file.txt')).toBe(true);
    expect(await readTestFile(testDir, 'deeply/nested/file.txt')).toBe(content);
  });

  it('should handle file without ./ prefix', async () => {
    const context = createTestContext(testDir);
    const content = 'content without prefix';

    const result = await handleWriteFile({ path: 'noprefix.txt', content }, context);

    expect(result.content[0].text).toBe('Successfully wrote to noprefix.txt');
    expect(await fileExists(testDir, 'noprefix.txt')).toBe(true);
    expect(await readTestFile(testDir, 'noprefix.txt')).toBe(content);
  });

  describePosix('symlinks', () => {
    let outsideDir: string;

    beforeEach(async () => {
      outsideDir = await fs.mkdtemp(path.join(tmpdir(), 'coco-outside-'));
    });

    afterEach(async () => {
      await fs.rm(outsideDir, { recursive: true, force: true });
    });

    it('should refuse to write through a symlink that leads outside the root', async () => {
      await fs.symlink(outsideDir, path.join(testDir, 'escape'));
      const context = createTestContext(testDir);

      await expect(
        handleWriteFile({ path: 'escape/new.txt', content: 'should not be written' }, context)
      ).rejects.toThrow('Path leads outside the root directory through a symlink');
      expect(await fs.readdir(outsideDir)).toEqual([]);
    });

    it('should write through a symlink inside the root and keep the link', async () => {
      await createTestFile(testDir, 'target.txt', 'old');
      await fs.symlink(path.join(testDir, 'target.txt'), path.join(testDir, 'link.txt'));
      const context = createTestContext(testDir);

      await handleWriteFile({ path: 'link.txt', content: 'new' }, context);

      expect((await fs.lstat(path.join(testDir, 'link.txt'))).isSymbolicLink()).toBe(true);
      expect(await readTestFile(testDir, 'target.txt')).toBe('new');
    });

    it('should refuse to create a file through a broken symlink', async () => {
      await fs.symlink(path.join(outsideDir, 'missing-dir'), path.join(testDir, 'dangling'));
      const context = createTestContext(testDir);

      await expect(
        handleWriteFile({ path: 'dangling/new.txt', content: 'x' }, context)
      ).rejects.toThrow('Path goes through a broken symlink');
    });
  });
});
