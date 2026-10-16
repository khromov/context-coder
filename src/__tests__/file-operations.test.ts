import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import {
  searchFiles,
  normalizeLineEndings,
  buildTree,
  writeFileSecure,
} from '../file-operations.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// File permission bits are a POSIX concept
const itPosix = process.platform === 'win32' ? it.skip : it;

describe('file-operations', () => {
  const TEST_DIR = path.join(__dirname, 'test-file-operations-temp');

  beforeAll(async () => {
    // Create main test directory
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    // Clean up main test directory
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
  });

  describe('searchFiles', () => {
    let searchTestDir: string;

    beforeEach(async () => {
      searchTestDir = path.join(TEST_DIR, 'search-test');
      await fs.mkdir(searchTestDir, { recursive: true });

      // Create test directory structure
      await fs.mkdir(path.join(searchTestDir, 'subdir1'), { recursive: true });
      await fs.mkdir(path.join(searchTestDir, 'subdir2'), { recursive: true });
      await fs.mkdir(path.join(searchTestDir, 'node_modules'), { recursive: true });

      // Create test files
      await fs.writeFile(path.join(searchTestDir, 'test.txt'), 'content');
      await fs.writeFile(path.join(searchTestDir, 'test.js'), 'console.log("test");');
      await fs.writeFile(path.join(searchTestDir, 'readme.md'), '# Test');
      await fs.writeFile(path.join(searchTestDir, 'subdir1', 'nested.txt'), 'nested');
      await fs.writeFile(path.join(searchTestDir, 'subdir2', 'another.js'), 'another');
      await fs.writeFile(path.join(searchTestDir, 'node_modules', 'package.json'), '{}');
    });

    afterEach(async () => {
      try {
        await fs.rm(searchTestDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should find files matching pattern', async () => {
      const results = await searchFiles(searchTestDir, 'test');

      expect(results).toHaveLength(2);
      expect(results.some((result) => result.includes('test.txt'))).toBe(true);
      expect(results.some((result) => result.includes('test.js'))).toBe(true);
    });

    it('should search case-insensitively', async () => {
      const results = await searchFiles(searchTestDir, 'TEST');

      expect(results).toHaveLength(2);
      expect(results.some((result) => result.includes('test.txt'))).toBe(true);
      expect(results.some((result) => result.includes('test.js'))).toBe(true);
    });

    it('should find nested files', async () => {
      const results = await searchFiles(searchTestDir, 'nested');

      expect(results).toHaveLength(1);
      expect(results[0]).toContain('nested.txt');
    });

    it('should exclude files matching exclude patterns', async () => {
      const results = await searchFiles(searchTestDir, 'package', ['node_modules']);

      expect(results).toHaveLength(0);
    });

    it('should handle multiple exclude patterns', async () => {
      const results = await searchFiles(searchTestDir, '.js', ['node_modules', 'subdir2']);

      expect(results).toHaveLength(1);
      expect(results[0]).toContain('test.js');
    });

    it('should handle exclude patterns with wildcards', async () => {
      const results = await searchFiles(searchTestDir, '.js', ['**/node_modules/**']);

      expect(results).toHaveLength(2);
      expect(results.some((result) => result.includes('test.js'))).toBe(true);
      expect(results.some((result) => result.includes('another.js'))).toBe(true);
    });

    it('should not descend into node_modules or .git without exclude patterns', async () => {
      await fs.writeFile(path.join(searchTestDir, 'node_modules', 'test-dependency.js'), '');
      await fs.mkdir(path.join(searchTestDir, '.git'), { recursive: true });
      await fs.writeFile(path.join(searchTestDir, '.git', 'test-object'), '');

      const results = await searchFiles(searchTestDir, 'test');

      expect(results).toHaveLength(2);
      expect(results.some((result) => result.includes('node_modules'))).toBe(false);
      expect(results.some((result) => result.includes('.git'))).toBe(false);
    });

    it('should still search inside node_modules when the search starts there', async () => {
      await fs.writeFile(path.join(searchTestDir, 'node_modules', 'test-dependency.js'), '');

      const results = await searchFiles(path.join(searchTestDir, 'node_modules'), 'test');

      expect(results).toHaveLength(1);
      expect(results[0]).toContain('test-dependency.js');
    });

    it('should still match skipped folders by name', async () => {
      const results = await searchFiles(searchTestDir, 'node_modules');

      expect(results).toHaveLength(1);
      expect(results[0]).toBe(path.join(searchTestDir, 'node_modules'));
    });

    it('should return empty array when no matches found', async () => {
      const results = await searchFiles(searchTestDir, 'nonexistent');

      expect(results).toHaveLength(0);
    });

    it('should handle search in non-existent directory gracefully', async () => {
      const nonExistentDir = path.join(TEST_DIR, 'does-not-exist');
      const results = await searchFiles(nonExistentDir, 'anything');

      expect(results).toHaveLength(0);
    });
  });

  describe('normalizeLineEndings', () => {
    it('should convert CRLF to LF', () => {
      const input = 'line1\r\nline2\r\nline3';
      const expected = 'line1\nline2\nline3';

      expect(normalizeLineEndings(input)).toBe(expected);
    });

    it('should leave LF unchanged', () => {
      const input = 'line1\nline2\nline3';

      expect(normalizeLineEndings(input)).toBe(input);
    });

    it('should handle mixed line endings', () => {
      const input = 'line1\r\nline2\nline3\r\nline4';
      const expected = 'line1\nline2\nline3\nline4';

      expect(normalizeLineEndings(input)).toBe(expected);
    });

    it('should handle empty string', () => {
      expect(normalizeLineEndings('')).toBe('');
    });

    it('should handle string with no line endings', () => {
      const input = 'single line';
      expect(normalizeLineEndings(input)).toBe(input);
    });

    it('should handle string with only line endings', () => {
      const input = '\r\n\r\n\r\n';
      const expected = '\n\n\n';

      expect(normalizeLineEndings(input)).toBe(expected);
    });
  });

  describe('buildTree', () => {
    let treeTestDir: string;

    beforeEach(async () => {
      treeTestDir = path.join(TEST_DIR, 'tree-test');
      await fs.mkdir(treeTestDir, { recursive: true });

      // Create test directory structure
      await fs.mkdir(path.join(treeTestDir, 'src'), { recursive: true });
      await fs.mkdir(path.join(treeTestDir, 'src', 'components'), { recursive: true });
      await fs.mkdir(path.join(treeTestDir, 'lib'), { recursive: true });
      await fs.mkdir(path.join(treeTestDir, 'node_modules'), { recursive: true }); // Should be ignored

      // Create test files
      await fs.writeFile(path.join(treeTestDir, 'package.json'), '{}');
      await fs.writeFile(path.join(treeTestDir, 'README.md'), '# Test');
      await fs.writeFile(path.join(treeTestDir, 'src', 'index.ts'), 'export {};');
      await fs.writeFile(path.join(treeTestDir, 'src', 'components', 'Button.tsx'), 'export {};');
      await fs.writeFile(path.join(treeTestDir, 'lib', 'utils.ts'), 'export {};');
      await fs.writeFile(path.join(treeTestDir, 'node_modules', 'package.json'), '{}'); // Should be ignored
    });

    afterEach(async () => {
      try {
        await fs.rm(treeTestDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should build correct tree structure', async () => {
      const tree = await buildTree(treeTestDir);

      expect(tree).toHaveLength(4); // package.json, README.md, src, lib (node_modules should be ignored)

      const srcEntry = tree.find((entry) => entry.name === 'src');
      expect(srcEntry).toBeDefined();
      expect(srcEntry!.type).toBe('directory');
      expect(srcEntry!.children).toHaveLength(2); // index.ts and components

      const componentsEntry = srcEntry!.children!.find((entry) => entry.name === 'components');
      expect(componentsEntry).toBeDefined();
      expect(componentsEntry!.type).toBe('directory');
      expect(componentsEntry!.children).toHaveLength(1); // Button.tsx

      const packageJsonEntry = tree.find((entry) => entry.name === 'package.json');
      expect(packageJsonEntry).toBeDefined();
      expect(packageJsonEntry!.type).toBe('file');
      expect(packageJsonEntry!.children).toBeUndefined();
    });

    it('should ignore default patterns', async () => {
      const tree = await buildTree(treeTestDir);

      // node_modules should be ignored
      const nodeModulesEntry = tree.find((entry) => entry.name === 'node_modules');
      expect(nodeModulesEntry).toBeUndefined();
    });

    it('should handle empty directory', async () => {
      const emptyDir = path.join(TEST_DIR, 'empty-tree-test');
      await fs.mkdir(emptyDir, { recursive: true });

      const tree = await buildTree(emptyDir);
      expect(tree).toHaveLength(0);

      await fs.rmdir(emptyDir);
    });

    it('should handle directory with only ignored files', async () => {
      const ignoredDir = path.join(TEST_DIR, 'ignored-tree-test');
      await fs.mkdir(ignoredDir, { recursive: true });
      await fs.mkdir(path.join(ignoredDir, 'node_modules'), { recursive: true });
      await fs.writeFile(path.join(ignoredDir, 'node_modules', 'test.js'), 'test');

      const tree = await buildTree(ignoredDir);
      expect(tree).toHaveLength(0);

      await fs.rm(ignoredDir, { recursive: true });
    });
  });

  describe('writeFileSecure', () => {
    let writeTestDir: string;

    beforeEach(async () => {
      writeTestDir = path.join(TEST_DIR, 'write-test');
      await fs.mkdir(writeTestDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await fs.rm(writeTestDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should create new file with wx flag when file does not exist', async () => {
      const testFile = path.join(writeTestDir, 'new-file.txt');
      const content = 'Hello, new file!';

      await writeFileSecure(testFile, content);

      const writtenContent = await fs.readFile(testFile, 'utf-8');
      expect(writtenContent).toBe(content);
    });

    it('should use atomic rename when file exists', async () => {
      const testFile = path.join(writeTestDir, 'existing-file.txt');
      const originalContent = 'Original content';
      const newContent = 'New content';

      // Create existing file
      await fs.writeFile(testFile, originalContent);

      // Overwrite with writeFileSecure
      await writeFileSecure(testFile, newContent);

      const writtenContent = await fs.readFile(testFile, 'utf-8');
      expect(writtenContent).toBe(newContent);
    });

    itPosix('should keep the permissions of a file it overwrites', async () => {
      const testFile = path.join(writeTestDir, 'script.sh');
      await fs.writeFile(testFile, '#!/bin/sh\necho old\n');
      await fs.chmod(testFile, 0o755);

      await writeFileSecure(testFile, '#!/bin/sh\necho new\n');

      const { mode } = await fs.stat(testFile);
      expect(mode & 0o777).toBe(0o755);
      expect(await fs.readFile(testFile, 'utf-8')).toBe('#!/bin/sh\necho new\n');
    });

    it('should handle concurrent writes to the same file', async () => {
      const testFile = path.join(writeTestDir, 'concurrent-file.txt');
      const content1 = 'Content from write 1';
      const content2 = 'Content from write 2';

      // Create existing file first
      await fs.writeFile(testFile, 'initial');

      // Start two concurrent writes
      const write1Promise = writeFileSecure(testFile, content1);
      const write2Promise = writeFileSecure(testFile, content2);

      // Both should complete without error
      await Promise.all([write1Promise, write2Promise]);

      // File should contain one of the contents
      const finalContent = await fs.readFile(testFile, 'utf-8');
      expect([content1, content2]).toContain(finalContent);
    });

    it('should handle writing to nested directories', async () => {
      const nestedFile = path.join(writeTestDir, 'nested', 'deep', 'file.txt');
      const content = 'Nested file content';

      // Create parent directories
      await fs.mkdir(path.dirname(nestedFile), { recursive: true });

      await writeFileSecure(nestedFile, content);

      const writtenContent = await fs.readFile(nestedFile, 'utf-8');
      expect(writtenContent).toBe(content);
    });

    it('should handle unicode content correctly', async () => {
      const testFile = path.join(writeTestDir, 'unicode-file.txt');
      const unicodeContent = '🥥 Hello, 世界! 🌟 Café naïve résumé';

      await writeFileSecure(testFile, unicodeContent);

      const writtenContent = await fs.readFile(testFile, 'utf-8');
      expect(writtenContent).toBe(unicodeContent);
    });

    it('should handle large file content', async () => {
      const testFile = path.join(writeTestDir, 'large-file.txt');
      const largeContent = 'x'.repeat(100000); // 100KB of 'x'

      await writeFileSecure(testFile, largeContent);

      const writtenContent = await fs.readFile(testFile, 'utf-8');
      expect(writtenContent).toBe(largeContent);
      expect(writtenContent.length).toBe(100000);
    });

    it('should handle empty content', async () => {
      const testFile = path.join(writeTestDir, 'empty-file.txt');
      const emptyContent = '';

      await writeFileSecure(testFile, emptyContent);

      const writtenContent = await fs.readFile(testFile, 'utf-8');
      expect(writtenContent).toBe(emptyContent);
    });

    it('should throw error when writing to non-existent directory without creating parent', async () => {
      const testFile = path.join(writeTestDir, 'non-existent', 'file.txt');
      const content = 'Should fail';

      await expect(writeFileSecure(testFile, content)).rejects.toThrow();
    });

    it('should handle temporary file cleanup', async () => {
      const testFile = path.join(writeTestDir, 'test-cleanup.txt');
      const content = 'test';

      // Create the file first
      await fs.writeFile(testFile, 'initial');

      // This test verifies that temporary files aren't left behind during normal operation
      await writeFileSecure(testFile, content);

      // Check that no temp files are left behind
      const files = await fs.readdir(writeTestDir);
      const tempFiles = files.filter((file) => file.includes('.tmp'));
      expect(tempFiles).toHaveLength(0);

      // Verify content was written correctly
      const writtenContent = await fs.readFile(testFile, 'utf-8');
      expect(writtenContent).toBe(content);
    });
  });

  describe('integration tests', () => {
    let integrationTestDir: string;

    beforeEach(async () => {
      integrationTestDir = path.join(TEST_DIR, 'integration-test');
      await fs.mkdir(integrationTestDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await fs.rm(integrationTestDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should work together: write file, search, and build tree', async () => {
      // Write a file
      const testFile = path.join(integrationTestDir, 'integration.txt');
      const content = 'Integration test content\r\nWith multiple lines\r\n';
      await writeFileSecure(testFile, content);

      // Normalize and write normalized content
      const normalizedContent = normalizeLineEndings(content);
      await writeFileSecure(testFile, normalizedContent);

      // Search for the file
      const searchResults = await searchFiles(integrationTestDir, 'integration');
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0]).toContain('integration.txt');

      // Build tree
      const tree = await buildTree(integrationTestDir);
      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('integration.txt');
      expect(tree[0].type).toBe('file');
    });

    it('should handle complex directory structure with all operations', async () => {
      // Create complex structure
      await fs.mkdir(path.join(integrationTestDir, 'src', 'utils'), { recursive: true });
      await fs.mkdir(path.join(integrationTestDir, 'tests'), { recursive: true });

      // Write multiple files
      const files = [
        { path: 'package.json', content: '{"name": "test"}' },
        { path: 'src/index.js', content: 'console.log("hello");' },
        { path: 'src/utils/helper.js', content: 'export function help() {}' },
        { path: 'tests/test.js', content: 'test("should work", () => {});' },
      ];

      for (const file of files) {
        const fullPath = path.join(integrationTestDir, file.path);
        await writeFileSecure(fullPath, file.content);
      }

      // Search for .js files specifically
      const jsFiles = await searchFiles(integrationTestDir, '.js');
      const actualJsFiles = jsFiles.filter((file) => file.endsWith('.js'));
      expect(actualJsFiles).toHaveLength(3);

      // Build complete tree
      const tree = await buildTree(integrationTestDir);
      expect(tree).toHaveLength(3); // package.json, src, tests

      const srcEntry = tree.find((entry) => entry.name === 'src');
      expect(srcEntry!.children).toHaveLength(2); // index.js, utils

      const utilsEntry = srcEntry!.children!.find((entry) => entry.name === 'utils');
      expect(utilsEntry!.children).toHaveLength(1); // helper.js
    });
  });
});
