import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { handleMoveFile } from '../../handlers/move_file.js';
import {
  setupTestDir,
  cleanupTestDir,
  createTestContext,
  createTestFile,
  fileExists,
  readTestFile,
} from './test-utils.js';

describe('handleMoveFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await setupTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it('should move file to different directory', async () => {
    const content = 'File content to move';
    await createTestFile(testDir, 'source.txt', content);

    const context = createTestContext(testDir);
    const result = await handleMoveFile(
      {
        source: './source.txt',
        destination: './moved/target.txt',
      },
      context
    );

    expect(result.content[0].text).toBe('Successfully moved source.txt to moved/target.txt');
    expect(await fileExists(testDir, 'source.txt')).toBe(false);
    expect(await fileExists(testDir, 'moved/target.txt')).toBe(true);
    expect(await readTestFile(testDir, 'moved/target.txt')).toBe(content);
  });

  it('should rename file in same directory', async () => {
    const content = 'File to rename';
    await createTestFile(testDir, 'oldname.txt', content);

    const context = createTestContext(testDir);
    const result = await handleMoveFile(
      {
        source: './oldname.txt',
        destination: './newname.txt',
      },
      context
    );

    expect(result.content[0].text).toBe('Successfully moved oldname.txt to newname.txt');
    expect(await fileExists(testDir, 'oldname.txt')).toBe(false);
    expect(await fileExists(testDir, 'newname.txt')).toBe(true);
    expect(await readTestFile(testDir, 'newname.txt')).toBe(content);
  });

  it('should fail when source file does not exist', async () => {
    const context = createTestContext(testDir);

    await expect(
      handleMoveFile(
        {
          source: './nonexistent.txt',
          destination: './target.txt',
        },
        context
      )
    ).rejects.toThrow('ENOENT');
  });

  it('should handle paths without ./ prefix', async () => {
    const content = 'File without prefix';
    await createTestFile(testDir, 'noslash.txt', content);

    const context = createTestContext(testDir);
    const result = await handleMoveFile(
      {
        source: 'noslash.txt',
        destination: 'renamed.txt',
      },
      context
    );

    expect(result.content[0].text).toBe('Successfully moved noslash.txt to renamed.txt');
    expect(await fileExists(testDir, 'noslash.txt')).toBe(false);
    expect(await fileExists(testDir, 'renamed.txt')).toBe(true);
  });

  describe('git integration', () => {
    it('should gracefully handle git operations', async () => {
      // This is an integration test that verifies the git integration works
      // without mocking. The actual behavior will depend on whether git is available
      // and whether the test directory is in a git repository.
      const content = 'File to move with potential git integration';
      await createTestFile(testDir, 'source.txt', content);

      const context = createTestContext(testDir);
      const result = await handleMoveFile(
        {
          source: './source.txt',
          destination: './target.txt',
        },
        context
      );

      // The operation should succeed regardless of git availability
      expect(result.content[0].text).toBe('Successfully moved source.txt to target.txt');
      expect(await fileExists(testDir, 'source.txt')).toBe(false);
      expect(await fileExists(testDir, 'target.txt')).toBe(true);
      expect(await readTestFile(testDir, 'target.txt')).toBe(content);
    });
  });
});
