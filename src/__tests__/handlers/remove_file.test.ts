import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { handleRemoveFile } from '../../handlers/remove_file.js';
import {
  setupTestDir,
  cleanupTestDir,
  createTestContext,
  fileExists,
  createTestFile,
  readTestFile,
} from './test-utils.js';
import fs from 'fs/promises';
import path from 'path';

// Creating symlinks on Windows needs extra privileges
const itPosix = process.platform === 'win32' ? it.skip : it;

describe('handleRemoveFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await setupTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  describe('successful file removal', () => {
    it('should remove a file successfully', async () => {
      const context = createTestContext(testDir);
      await createTestFile(testDir, 'test.txt', 'test content');

      const result = await handleRemoveFile({ path: 'test.txt' }, context);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Successfully removed file test.txt');
      expect(result.isError).toBeUndefined();
      expect(await fileExists(testDir, 'test.txt')).toBe(false);
    });

    it('should remove a file with ./ prefix', async () => {
      const context = createTestContext(testDir);
      await createTestFile(testDir, 'test.txt', 'test content');

      const result = await handleRemoveFile({ path: './test.txt' }, context);

      expect(result.content[0].text).toBe('Successfully removed file test.txt');
      expect(await fileExists(testDir, 'test.txt')).toBe(false);
    });

    it('should remove a file in a subdirectory', async () => {
      const context = createTestContext(testDir);
      await createTestFile(testDir, 'subdir/nested.txt', 'nested content');

      const result = await handleRemoveFile({ path: 'subdir/nested.txt' }, context);

      expect(result.content[0].text).toBe('Successfully removed file subdir/nested.txt');
      expect(await fileExists(testDir, 'subdir/nested.txt')).toBe(false);
    });

    itPosix('should remove a symlink itself, not the file it points to', async () => {
      const context = createTestContext(testDir);
      await createTestFile(testDir, 'target.txt', 'keep me');
      await fs.symlink(path.join(testDir, 'target.txt'), path.join(testDir, 'link.txt'));

      await handleRemoveFile({ path: 'link.txt' }, context);

      expect(await fileExists(testDir, 'link.txt')).toBe(false);
      expect(await readTestFile(testDir, 'target.txt')).toBe('keep me');
    });
  });

  describe('error cases', () => {
    it('should throw error for missing arguments', async () => {
      const context = createTestContext(testDir);

      await expect(handleRemoveFile({}, context)).rejects.toThrow(
        'Invalid arguments for remove_file'
      );
    });

    it('should throw error for invalid path type', async () => {
      const context = createTestContext(testDir);

      await expect(handleRemoveFile({ path: 123 }, context)).rejects.toThrow(
        'Invalid arguments for remove_file'
      );
    });

    it('should throw error for non-existent file', async () => {
      const context = createTestContext(testDir);

      await expect(handleRemoveFile({ path: 'nonexistent.txt' }, context)).rejects.toThrow(
        'File not found: nonexistent.txt'
      );
    });

    it('should throw error when trying to remove a directory', async () => {
      const context = createTestContext(testDir);
      const dirPath = path.join(testDir, 'testdir');
      await fs.mkdir(dirPath);

      await expect(handleRemoveFile({ path: 'testdir' }, context)).rejects.toThrow(
        'Cannot remove directory with remove_file. Use rm with execute_command instead.'
      );
    });

    it('should throw error for parent directory traversal', async () => {
      const context = createTestContext(testDir);

      await expect(handleRemoveFile({ path: '../outside.txt' }, context)).rejects.toThrow(
        'Path cannot contain parent directory references'
      );
    });

    it('should throw error for complex parent directory traversal', async () => {
      const context = createTestContext(testDir);

      await expect(handleRemoveFile({ path: 'subdir/../../outside.txt' }, context)).rejects.toThrow(
        'Path cannot contain parent directory references'
      );
    });

    it('should throw error for Windows-style parent directory traversal', async () => {
      const context = createTestContext(testDir);

      await expect(
        handleRemoveFile({ path: 'subdir\\..\\..\\outside.txt' }, context)
      ).rejects.toThrow('Path cannot contain parent directory references');
    });
  });

  describe('path normalization', () => {
    it('should handle empty path gracefully', async () => {
      const context = createTestContext(testDir);

      await expect(handleRemoveFile({ path: '' }, context)).rejects.toThrow();
    });

    it('should handle current directory reference', async () => {
      const context = createTestContext(testDir);

      await expect(handleRemoveFile({ path: '.' }, context)).rejects.toThrow();
    });

    it('should handle various path formats', async () => {
      const context = createTestContext(testDir);
      await createTestFile(testDir, 'file1.txt', 'content1');
      await createTestFile(testDir, 'file2.txt', 'content2');

      await handleRemoveFile({ path: './file1.txt' }, context);
      await handleRemoveFile({ path: 'file2.txt' }, context);

      expect(await fileExists(testDir, 'file1.txt')).toBe(false);
      expect(await fileExists(testDir, 'file2.txt')).toBe(false);
    });
  });

  describe('file system edge cases', () => {
    it('should handle files with special characters in name', async () => {
      const context = createTestContext(testDir);
      const specialFileName = 'test file with spaces & symbols!.txt';
      await createTestFile(testDir, specialFileName, 'special content');

      const result = await handleRemoveFile({ path: specialFileName }, context);

      expect(result.content[0].text).toBe(`Successfully removed file ${specialFileName}`);
      expect(await fileExists(testDir, specialFileName)).toBe(false);
    });

    it('should handle removing a file with no extension', async () => {
      const context = createTestContext(testDir);
      await createTestFile(testDir, 'README', 'readme content');

      const result = await handleRemoveFile({ path: 'README' }, context);

      expect(result.content[0].text).toBe('Successfully removed file README');
      expect(await fileExists(testDir, 'README')).toBe(false);
    });

    it('should handle deeply nested file paths', async () => {
      const context = createTestContext(testDir);
      const deepPath = 'level1/level2/level3/level4/deep.txt';
      await createTestFile(testDir, deepPath, 'deep content');

      const result = await handleRemoveFile({ path: deepPath }, context);

      expect(result.content[0].text).toBe(`Successfully removed file ${deepPath}`);
      expect(await fileExists(testDir, deepPath)).toBe(false);
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple file removals concurrently', async () => {
      const context = createTestContext(testDir);

      // Create multiple test files
      const filePromises = [];
      for (let i = 0; i < 5; i++) {
        filePromises.push(createTestFile(testDir, `concurrent-${i}.txt`, `content ${i}`));
      }
      await Promise.all(filePromises);

      // Remove all files concurrently
      const removePromises = [];
      for (let i = 0; i < 5; i++) {
        removePromises.push(handleRemoveFile({ path: `concurrent-${i}.txt` }, context));
      }
      const results = await Promise.all(removePromises);

      // Verify all operations succeeded
      results.forEach((result, i) => {
        expect(result.content[0].text).toBe(`Successfully removed file concurrent-${i}.txt`);
      });

      // Verify all files are removed
      for (let i = 0; i < 5; i++) {
        expect(await fileExists(testDir, `concurrent-${i}.txt`)).toBe(false);
      }
    });
  });
});
