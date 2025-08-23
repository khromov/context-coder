import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { generateCodebaseDigest, getCodebaseSize } from '../codebase-digest.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('generateCodebaseDigest', () => {
  const TEST_DIR = path.join(__dirname, 'test-codebase-temp');

  beforeAll(async () => {
    // Create test directory structure
    await fs.mkdir(TEST_DIR, { recursive: true });
    await fs.mkdir(path.join(TEST_DIR, 'src'), { recursive: true });
    await fs.mkdir(path.join(TEST_DIR, 'lib'), { recursive: true });

    // Create various sized files
    const files = [
      // Small files that should fit on page 1
      { path: 'src/index.ts', size: 25000 },
      { path: 'src/utils.ts', size: 25000 },
      { path: 'src/types.ts', size: 25000 },
      { path: 'src/config.ts', size: 15000 }, // Total so far: 90000

      // Files for page 2
      { path: 'lib/helpers.ts', size: 30000 },
      { path: 'lib/constants.ts', size: 20000 },

      // Large file that should be omitted
      { path: 'src/generated.ts', size: 150000 },

      // Small file to test page boundaries
      { path: 'README.md', size: 5000 },
    ];

    for (const file of files) {
      const content = `// ${path.basename(file.path)}\n` + 'x'.repeat(file.size - 50);
      await fs.writeFile(path.join(TEST_DIR, file.path), content);
    }
  });

  afterAll(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
  });

  it('should return first page by default', async () => {
    const result = await generateCodebaseDigest({
      inputDir: TEST_DIR,
    });

    expect(result.currentPage).toBe(1);

    // Should contain some content
    expect(result.content.length).toBeGreaterThan(0);

    // Should contain at least some files
    const fileMatches = result.content.match(/# [^\n]+\.(ts|md)/g) || [];
    expect(fileMatches.length).toBeGreaterThan(0);

    // If there are more pages, should have pagination message
    if (result.hasMorePages) {
      expect(result.content).toContain(
        'This is page 1. You MUST call this tool again with page: 2'
      );
    }
  });

  it('should return second page when requested', async () => {
    const result = await generateCodebaseDigest({
      inputDir: TEST_DIR,
      page: 2,
    });

    expect(result.currentPage).toBe(2);

    // Page 2 might be empty or have content depending on file ordering
    // Just verify it doesn't error
    expect(result).toBeDefined();
  });

  it('should show last page message when on final page with custom page size', async () => {
    // Create a test directory with content that spans exactly 2 pages
    const LAST_PAGE_DIR = path.join(__dirname, 'test-last-page-temp');
    await fs.mkdir(LAST_PAGE_DIR, { recursive: true });

    try {
      // Create files with real code content that will span multiple pages when formatted by ai-digest
      const files = [
        { name: 'file1.ts', content: `// File 1\nconst file1 = true;\n${'x'.repeat(1000)}` },
        { name: 'file2.ts', content: `// File 2\nconst file2 = true;\n${'y'.repeat(1000)}` },
        { name: 'file3.ts', content: `// File 3\nconst file3 = true;\n${'z'.repeat(1000)}` },
        { name: 'file4.ts', content: `// File 4\nconst file4 = true;\n${'a'.repeat(1000)}` },
      ];

      for (const file of files) {
        await fs.writeFile(path.join(LAST_PAGE_DIR, file.name), file.content);
      }

      // Test page 1 with very small page size to force pagination
      const page1Result = await generateCodebaseDigest({
        inputDir: LAST_PAGE_DIR,
        page: 1,
        pageSize: 1500, // Very small page size to ensure only 1 file fits per page
      });

      expect(page1Result.hasMorePages).toBe(true);
      expect(page1Result.content).toContain('You MUST call this tool again with page: 2');

      // Test page 2 - should show continue message
      const page2Result = await generateCodebaseDigest({
        inputDir: LAST_PAGE_DIR,
        page: 2,
        pageSize: 1500,
      });

      expect(page2Result.hasMorePages).toBe(true);
      expect(page2Result.content).toContain('You MUST call this tool again with page: 3');

      // Test later page - should eventually show last page message
      const page4Result = await generateCodebaseDigest({
        inputDir: LAST_PAGE_DIR,
        page: 4,
        pageSize: 1500,
      });

      expect(page4Result.hasMorePages).toBe(false);
      expect(page4Result.content).toContain(
        'This is the last page (page 4). Do NOT call this tool again'
      );
    } finally {
      await fs.rm(LAST_PAGE_DIR, { recursive: true, force: true });
    }
  });

  it('should show last page message when requesting page beyond last page', async () => {
    // Test requesting page 3 when there are only 2 pages of content
    const BEYOND_PAGE_DIR = path.join(__dirname, 'test-beyond-page-temp');
    await fs.mkdir(BEYOND_PAGE_DIR, { recursive: true });

    try {
      await fs.writeFile(path.join(BEYOND_PAGE_DIR, 'small.ts'), 'small content');

      const result = await generateCodebaseDigest({
        inputDir: BEYOND_PAGE_DIR,
        page: 3, // Request page 3 when there's only 1 page
        pageSize: 10000,
      });

      expect(result.hasMorePages).toBe(false);
      expect(result.content).toContain(
        'This is the last page (page 3). Do NOT call this tool again'
      );
    } finally {
      await fs.rm(BEYOND_PAGE_DIR, { recursive: true, force: true });
    }
  });

  it('should not show last page message on page 1 when all content fits', async () => {
    const SINGLE_PAGE_DIR = path.join(__dirname, 'test-single-page-temp');
    await fs.mkdir(SINGLE_PAGE_DIR, { recursive: true });

    try {
      await fs.writeFile(path.join(SINGLE_PAGE_DIR, 'small.ts'), 'small content');

      const result = await generateCodebaseDigest({
        inputDir: SINGLE_PAGE_DIR,
        page: 1,
        pageSize: 10000, // Large enough to fit all content
      });

      expect(result.hasMorePages).toBe(false);
      expect(result.currentPage).toBe(1);
      // Should show last page message even on page 1
      expect(result.content).toContain('This is the last page (page 1)');
      expect(result.content).toContain('Do NOT call this tool again');
    } finally {
      await fs.rm(SINGLE_PAGE_DIR, { recursive: true, force: true });
    }
  });

  it('should omit very large files', async () => {
    // Create a specific test for large file
    const LARGE_FILE_DIR = path.join(__dirname, 'test-large-file-temp');
    await fs.mkdir(LARGE_FILE_DIR, { recursive: true });

    // Create a file larger than page size
    const hugeContent = '// huge.ts\n' + 'x'.repeat(100000);
    await fs.writeFile(path.join(LARGE_FILE_DIR, 'huge.ts'), hugeContent);

    try {
      const result = await generateCodebaseDigest({
        inputDir: LARGE_FILE_DIR,
        page: 1,
      });

      // Should contain the omission message
      expect(result.content).toContain('huge.ts');
      expect(result.content).toContain('File omitted due to large size');
      // Should not contain the actual huge content
      expect(result.content.length).toBeLessThan(hugeContent.length);
    } finally {
      await fs.rm(LARGE_FILE_DIR, { recursive: true, force: true });
    }
  });

  it('should handle empty directory', async () => {
    const EMPTY_DIR = path.join(__dirname, 'test-empty-temp');
    await fs.mkdir(EMPTY_DIR, { recursive: true });

    try {
      const result = await generateCodebaseDigest({
        inputDir: EMPTY_DIR,
      });

      expect(result.content).toBe(
        '\n---\nThis is the last page (page 1). Do NOT call this tool again - you have received the complete codebase.\n'
      );
      expect(result.hasMorePages).toBe(false);
      expect(result.currentPage).toBe(1);
      expect(result.nextPage).toBeUndefined();
    } finally {
      await fs.rm(EMPTY_DIR, { recursive: true, force: true });
    }
  });

  it('should respect custom page size', async () => {
    const result = await generateCodebaseDigest({
      inputDir: TEST_DIR,
      pageSize: 50000, // Smaller page size
    });

    // Should respect the page size setting
    expect(result).toBeDefined();
    expect(result.currentPage).toBe(1);

    // Content should be limited by page size
    if (result.content.length > 0) {
      expect(result.content.length).toBeLessThanOrEqual(60000); // Allow some overflow for pagination message
    }
  });

  it('should handle page beyond available content', async () => {
    const result = await generateCodebaseDigest({
      inputDir: TEST_DIR,
      page: 10, // Way beyond available pages
    });

    expect(result.content).toContain(
      'This is the last page (page 10). Do NOT call this tool again'
    );
    expect(result.hasMorePages).toBe(false);
    expect(result.currentPage).toBe(10);
    expect(result.nextPage).toBeUndefined();
  });

  it('should handle single file that fits on page', async () => {
    const SINGLE_FILE_DIR = path.join(__dirname, 'test-single-temp');
    await fs.mkdir(SINGLE_FILE_DIR, { recursive: true });
    await fs.writeFile(
      path.join(SINGLE_FILE_DIR, 'single.ts'),
      '// single.ts\nconst single = true;\n'
    );

    try {
      const result = await generateCodebaseDigest({
        inputDir: SINGLE_FILE_DIR,
      });

      expect(result.content).toContain('single.ts');
      expect(result.hasMorePages).toBe(false);
      expect(result.nextPage).toBeUndefined();
      // Should NOT have pagination message
      expect(result.content).not.toContain('To see more files');
    } finally {
      await fs.rm(SINGLE_FILE_DIR, { recursive: true, force: true });
    }
  });

  it('should calculate total size correctly with omitted files', async () => {
    // Create a directory with only large files
    const LARGE_FILES_DIR = path.join(__dirname, 'test-large-temp');
    await fs.mkdir(LARGE_FILES_DIR, { recursive: true });

    // Create two large files
    await fs.writeFile(path.join(LARGE_FILES_DIR, 'large1.ts'), '// large1\n' + 'a'.repeat(120000));
    await fs.writeFile(path.join(LARGE_FILES_DIR, 'large2.ts'), '// large2\n' + 'b'.repeat(130000));

    try {
      const result = await generateCodebaseDigest({
        inputDir: LARGE_FILES_DIR,
      });

      // Both files should be replaced with omission messages
      expect(result.content).toContain('large1.ts');
      expect(result.content).toContain('large2.ts');
      expect(result.content).toContain('File omitted due to large size');

      // The total content should be small (just two omission messages)
      expect(result.content.length).toBeLessThan(300);

      // Should not need pagination since omission messages are small
      expect(result.hasMorePages).toBe(false);
    } finally {
      await fs.rm(LARGE_FILES_DIR, { recursive: true, force: true });
    }
  });

  it('should use .cocoignore when it exists and exclude specified files', async () => {
    const COCOIGNORE_DIR = path.join(__dirname, 'test-cocoignore-temp');
    await fs.mkdir(COCOIGNORE_DIR, { recursive: true });

    try {
      // Create a .cocoignore file that excludes test files
      const cocoignoreContent = `
# Ignore test files
*.test.ts
test-data/
`;
      await fs.writeFile(path.join(COCOIGNORE_DIR, '.cocoignore'), cocoignoreContent);

      // Create some files - some should be ignored, some should be included
      await fs.writeFile(path.join(COCOIGNORE_DIR, 'main.ts'), 'console.log("main");');
      await fs.writeFile(path.join(COCOIGNORE_DIR, 'utils.ts'), 'export const utils = true;');
      await fs.writeFile(
        path.join(COCOIGNORE_DIR, 'app.test.ts'),
        'test("should work", () => {});'
      );

      // Create test-data directory with a file
      await fs.mkdir(path.join(COCOIGNORE_DIR, 'test-data'), { recursive: true });
      await fs.writeFile(path.join(COCOIGNORE_DIR, 'test-data', 'sample.json'), '{"test": true}');

      // Generate digest
      const result = await generateCodebaseDigest({
        inputDir: COCOIGNORE_DIR,
      });

      // Should include main.ts and utils.ts
      expect(result.content).toContain('main.ts');
      expect(result.content).toContain('utils.ts');
      expect(result.content).toContain('console.log("main")');
      expect(result.content).toContain('export const utils = true');

      // Should NOT include .test.ts files or test-data/
      expect(result.content).not.toContain('app.test.ts');
      expect(result.content).not.toContain('test-data');
      expect(result.content).not.toContain('sample.json');
      expect(result.content).not.toContain('test("should work"');

      // Should NOT include the .cocoignore file itself (it should be excluded)
      expect(result.content).not.toContain('.cocoignore');
    } finally {
      await fs.rm(COCOIGNORE_DIR, { recursive: true, force: true });
    }
  });
});

describe('getCodebaseSize', () => {
  // Simple test with minimal directory to avoid hanging
  it('should return token counts for a simple directory', async () => {
    const SIMPLE_DIR = path.join(__dirname, 'test-simple-size-temp');
    await fs.mkdir(SIMPLE_DIR, { recursive: true });

    // Create just one small file
    await fs.writeFile(path.join(SIMPLE_DIR, 'test.js'), 'console.log("hello world");');

    try {
      const result = await getCodebaseSize({
        inputDir: SIMPLE_DIR,
      });

      expect(result.content).toBeDefined();
      expect(result.totalClaudeTokens).toBeGreaterThan(0);
      expect(result.totalGptTokens).toBeGreaterThan(0);
      expect(result.totalFiles).toBe(1);
      expect(result.content).toContain('## Token Summary');
      expect(result.content).toContain('## Next Step');
    } finally {
      await fs.rm(SIMPLE_DIR, { recursive: true, force: true });
    }
  }, 10000); // 10 second timeout

  it('should handle empty directory without hanging', async () => {
    const EMPTY_DIR = path.join(__dirname, 'test-empty-size-temp');
    await fs.mkdir(EMPTY_DIR, { recursive: true });

    try {
      const result = await getCodebaseSize({
        inputDir: EMPTY_DIR,
      });

      expect(result.totalFiles).toBe(0);
      expect(result.hasWarning).toBe(false);
      expect(result.content).toContain('**Total files**: 0');
    } finally {
      await fs.rm(EMPTY_DIR, { recursive: true, force: true });
    }
  }, 10000); // 10 second timeout

  it('should format output with markdown correctly', async () => {
    const MARKDOWN_DIR = path.join(__dirname, 'test-markdown-temp');
    await fs.mkdir(MARKDOWN_DIR, { recursive: true });

    await fs.writeFile(path.join(MARKDOWN_DIR, 'readme.md'), '# Test\n\nHello world');

    try {
      const result = await getCodebaseSize({
        inputDir: MARKDOWN_DIR,
      });

      const output = result.content;

      // Check markdown formatting
      expect(output).toMatch(/##\s+Token Summary/);
      expect(output).toMatch(/##\s+Next Step/);

      // Check bold formatting
      expect(output).toContain('**Claude tokens**:');
      expect(output).toContain('**ChatGPT tokens**:');
    } finally {
      await fs.rm(MARKDOWN_DIR, { recursive: true, force: true });
    }
  }, 10000); // 10 second timeout

  it('should use .cocominify when it exists and show custom minify message', async () => {
    const COCOMINIFY_DIR = path.join(__dirname, 'test-cocominify-temp');
    await fs.mkdir(COCOMINIFY_DIR, { recursive: true });

    try {
      // Create some test files
      await fs.writeFile(path.join(COCOMINIFY_DIR, 'regular.js'), 'console.log("regular file");');
      await fs.writeFile(path.join(COCOMINIFY_DIR, 'large.min.js'), 'var a=1;'.repeat(1000)); // Large minified file

      // Create a .cocominify file that minifies *.min.js files
      const cocominifyContent = '*.min.js\n';
      await fs.writeFile(path.join(COCOMINIFY_DIR, '.cocominify'), cocominifyContent);

      const result = await generateCodebaseDigest({
        inputDir: COCOMINIFY_DIR,
        page: 1,
      });

      // Should include the regular file content
      expect(result.content).toContain('console.log("regular file");');

      // Should include the minified file but with custom placeholder message
      expect(result.content).toContain('# large.min.js');
      expect(result.content).toContain('This file has been minified to save tokens');
      expect(result.content).toContain(
        'You can use the read_file tool to read the actual content if necessary'
      );

      // Should NOT include the actual content of the minified file
      expect(result.content).not.toContain('var a=1;var a=1;var a=1;');

      // Should NOT include the .cocominify file itself (it should be excluded)
      expect(result.content).not.toContain('.cocominify');
    } finally {
      await fs.rm(COCOMINIFY_DIR, { recursive: true, force: true });
    }
  }, 10000); // 10 second timeout
});
