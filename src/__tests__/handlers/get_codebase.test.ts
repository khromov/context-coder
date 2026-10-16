import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { handleGetCodebase } from '../../handlers/get_codebase.js';
import { setupTestDir, cleanupTestDir, createTestContext, createTestFile } from './test-utils.js';

describe('handleGetCodebase', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await setupTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it('should generate codebase digest for simple files', async () => {
    await createTestFile(testDir, 'index.js', 'console.log("Hello World");');
    await createTestFile(testDir, 'utils.js', 'export const add = (a, b) => a + b;');

    const context = createTestContext(testDir);
    const result = await handleGetCodebase({ path: './', page: 1 }, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('index.js');
    expect(result.content[0].text).toContain('console.log("Hello World");');
    expect(result.content[0].text).toContain('utils.js');
    expect(result.content[0].text).toContain('export const add');
  });

  it('should handle pagination for multiple files', async () => {
    // 5 files of 25KB don't fit on one 99k-character page
    for (let i = 0; i < 5; i++) {
      const content = `// File ${i}\n` + 'x'.repeat(25000);
      await createTestFile(testDir, `file${i}.js`, content);
    }

    const context = createTestContext(testDir);
    const result = await handleGetCodebase({ path: './', page: 1 }, context);

    expect(result.content[0].text).toContain(
      'This is page 1. You MUST call this tool again with page: 2'
    );

    const page2 = await handleGetCodebase({ path: './', page: 2 }, context);
    expect(page2.content[0].text).toContain('This is the last page (page 2)');
  });

  it('should reject a page number that is not a positive whole number', async () => {
    await createTestFile(testDir, 'index.js', 'console.log("Hello World");');
    const context = createTestContext(testDir);

    await expect(handleGetCodebase({ path: './', page: 1.5 }, context)).rejects.toThrow(
      'Invalid arguments for get_codebase'
    );
    await expect(handleGetCodebase({ path: './', page: 0 }, context)).rejects.toThrow(
      'Invalid arguments for get_codebase'
    );
    await expect(handleGetCodebase({ path: './', _pageSize: -100 }, context)).rejects.toThrow(
      'Invalid arguments for get_codebase'
    );
  });

  it('should omit very large files', async () => {
    // Create a file larger than page size
    const hugeContent = '// Huge file\n' + 'x'.repeat(100000);
    await createTestFile(testDir, 'huge.js', hugeContent);

    const context = createTestContext(testDir);
    const result = await handleGetCodebase({ path: './', page: 1 }, context);

    expect(result.content[0].text).toContain('huge.js');
    expect(result.content[0].text).toContain('File omitted due to large size');
    // Should not contain the actual huge content
    expect(result.content[0].text.length).toBeLessThan(hugeContent.length);
  });

  describe('configurable page size (COCO_PAGE_SIZE)', () => {
    let originalPageSize: string | undefined;

    beforeEach(() => {
      originalPageSize = process.env.COCO_PAGE_SIZE;
    });

    afterEach(() => {
      if (originalPageSize !== undefined) {
        process.env.COCO_PAGE_SIZE = originalPageSize;
      } else {
        delete process.env.COCO_PAGE_SIZE;
      }
    });

    it('includes a file that would be omitted at the default page size when COCO_PAGE_SIZE is raised', async () => {
      // ~100k chars: omitted at the default (99000) but well under 200000
      const bigContent = '// Big file\n' + 'x'.repeat(100000);
      await createTestFile(testDir, 'big.js', bigContent);

      const context = createTestContext(testDir);

      // Default page size -> omitted
      delete process.env.COCO_PAGE_SIZE;
      const omitted = await handleGetCodebase({ path: './', page: 1 }, context);
      expect(omitted.content[0].text).toContain('File omitted due to large size');

      // Raised page size -> included in full
      process.env.COCO_PAGE_SIZE = '200000';
      const included = await handleGetCodebase({ path: './', page: 1 }, context);
      expect(included.content[0].text).not.toContain('File omitted due to large size');
      expect(included.content[0].text).toContain('x'.repeat(100000));
    });

    it('still honors an explicit _pageSize argument over the configured default', async () => {
      const bigContent = '// Big file\n' + 'x'.repeat(100000);
      await createTestFile(testDir, 'big.js', bigContent);

      const context = createTestContext(testDir);
      process.env.COCO_PAGE_SIZE = '10';

      // Explicit _pageSize wins over the (tiny) configured default
      const result = await handleGetCodebase({ path: './', page: 1, _pageSize: 200000 }, context);
      expect(result.content[0].text).not.toContain('File omitted due to large size');
      expect(result.content[0].text).toContain('x'.repeat(100000));
    });
  });
});
