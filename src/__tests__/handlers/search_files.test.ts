import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { handleSearchFiles } from '../../handlers/search_files.js';
import { setupTestDir, cleanupTestDir, createTestContext, createTestFile } from './test-utils.js';

describe('handleSearchFiles', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await setupTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it('should find files matching pattern', async () => {
    // Create test files
    await createTestFile(testDir, 'test1.js', 'content');
    await createTestFile(testDir, 'test2.js', 'content');
    await createTestFile(testDir, 'other.js', 'content');
    await createTestFile(testDir, 'src/test3.js', 'content');

    const context = createTestContext(testDir);
    const result = await handleSearchFiles(
      {
        path: './',
        pattern: 'test',
      },
      context
    );

    const files = result.content[0].text.split('\n');
    expect(files).toHaveLength(3);
    expect(files.some((f) => f === 'test1.js')).toBe(true);
    expect(files.some((f) => f === 'test2.js')).toBe(true);
    expect(files.some((f) => f === 'src/test3.js')).toBe(true);
    expect(files.some((f) => f.includes('other.js'))).toBe(false);
  });

  it('should exclude files based on patterns', async () => {
    await createTestFile(testDir, 'app.test.js', 'test');
    await createTestFile(testDir, 'src/component.test.js', 'test');
    await createTestFile(testDir, 'build-output/lib.test.js', 'test');

    const context = createTestContext(testDir);
    const result = await handleSearchFiles(
      {
        path: './',
        pattern: 'test',
        excludePatterns: ['build-output'],
      },
      context
    );

    const files = result.content[0].text.split('\n');
    expect(files.some((f) => f === 'app.test.js')).toBe(true);
    expect(files.some((f) => f === 'src/component.test.js')).toBe(true);
    expect(files.some((f) => f.includes('build-output'))).toBe(false);
  });

  it('should skip node_modules by default but search inside it when asked to', async () => {
    await createTestFile(testDir, 'app.test.js', 'test');
    await createTestFile(testDir, 'node_modules/lib/lib.test.js', 'test');

    const context = createTestContext(testDir);
    const fromRoot = await handleSearchFiles({ path: './', pattern: 'test' }, context);
    expect(fromRoot.content[0].text).toBe('app.test.js');

    const insideNodeModules = await handleSearchFiles(
      { path: './node_modules', pattern: 'test' },
      context
    );
    expect(insideNodeModules.content[0].text).toBe('node_modules/lib/lib.test.js');
  });

  it('should return message when no matches found', async () => {
    await createTestFile(testDir, 'file.txt', 'content');

    const context = createTestContext(testDir);
    const result = await handleSearchFiles(
      {
        path: './',
        pattern: 'nonexistent',
      },
      context
    );

    expect(result.content[0].text).toBe('No matches found');
  });

  it('should handle empty path', async () => {
    await createTestFile(testDir, 'test.js', 'content');

    const context = createTestContext(testDir);
    const result = await handleSearchFiles(
      {
        path: '',
        pattern: 'test',
      },
      context
    );

    const files = result.content[0].text.split('\n');
    expect(files).toHaveLength(1);
    expect(files[0]).toBe('test.js');
  });
});
