import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { handleEditFile } from '../../handlers/edit_file.js';
import {
  setupTestDir,
  cleanupTestDir,
  createTestContext,
  fileExists,
  readTestFile,
  createTestFile,
} from './test-utils.js';

describe('handleEditFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await setupTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  describe('basic edit operations', () => {
    it('should apply single text replacement', async () => {
      const originalContent = 'Hello world\nThis is a test\nGoodbye world';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [{ oldText: 'Hello world', newText: 'Hi universe' }],
          dryRun: false,
        },
        context
      );

      expect(result.content[0].text).toBe('Successfully applied 1 edit(s) to test.txt');
      expect(await readTestFile(testDir, 'test.txt')).toBe(
        'Hi universe\nThis is a test\nGoodbye world'
      );
    });

    it('should apply multiple text replacements', async () => {
      const originalContent = 'Hello world\nThis is a test\nGoodbye world';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [
            { oldText: 'Hello world', newText: 'Hi universe' },
            { oldText: 'Goodbye world', newText: 'See you later' },
          ],
          dryRun: false,
        },
        context
      );

      expect(result.content[0].text).toBe('Successfully applied 2 edit(s) to test.txt');
      expect(await readTestFile(testDir, 'test.txt')).toBe(
        'Hi universe\nThis is a test\nSee you later'
      );
    });

    it('should handle multiline text replacements', async () => {
      const originalContent = 'Line 1\nLine 2\nLine 3\nLine 4';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [{ oldText: 'Line 2\nLine 3', newText: 'New Line 2\nNew Line 3\nExtra Line' }],
          dryRun: false,
        },
        context
      );

      expect(result.content[0].text).toBe('Successfully applied 1 edit(s) to test.txt');
      expect(await readTestFile(testDir, 'test.txt')).toBe(
        'Line 1\nNew Line 2\nNew Line 3\nExtra Line\nLine 4'
      );
    });

    it('should handle file without ./ prefix', async () => {
      const originalContent = 'Original content';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: 'test.txt',
          edits: [{ oldText: 'Original', newText: 'Modified' }],
          dryRun: false,
        },
        context
      );

      expect(result.content[0].text).toBe('Successfully applied 1 edit(s) to test.txt');
      expect(await readTestFile(testDir, 'test.txt')).toBe('Modified content');
    });
  });

  describe('dry run functionality', () => {
    it('should generate diff preview without modifying file', async () => {
      const originalContent = 'Hello world\nThis is a test\nGoodbye world';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [{ oldText: 'Hello world', newText: 'Hi universe' }],
          dryRun: true,
        },
        context
      );

      expect(result.content[0].text).toContain('Dry run preview for test.txt:');
      expect(result.content[0].text).toContain('@@ Edit: Replace 1 line(s) with 1 line(s) @@');
      expect(result.content[0].text).toContain('-Hello world');
      expect(result.content[0].text).toContain('+Hi universe');

      expect(await readTestFile(testDir, 'test.txt')).toBe(originalContent);
    });

    it('should generate diff for multiple edits', async () => {
      const originalContent = 'First line\nSecond line\nThird line';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [
            { oldText: 'First line', newText: 'Modified first' },
            { oldText: 'Third line', newText: 'Modified third' },
          ],
          dryRun: true,
        },
        context
      );

      const diffText = result.content[0].text;
      expect(diffText).toContain('Dry run preview for test.txt:');
      expect(diffText).toContain('-First line');
      expect(diffText).toContain('+Modified first');
      expect(diffText).toContain('-Third line');
      expect(diffText).toContain('+Modified third');

      expect(await readTestFile(testDir, 'test.txt')).toBe(originalContent);
    });

    it('should generate diff for multiline replacements', async () => {
      const originalContent = 'Line 1\nLine 2\nLine 3\nLine 4';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [{ oldText: 'Line 2\nLine 3', newText: 'New Line A\nNew Line B\nNew Line C' }],
          dryRun: true,
        },
        context
      );

      const diffText = result.content[0].text;
      expect(diffText).toContain('@@ Edit: Replace 2 line(s) with 3 line(s) @@');
      expect(diffText).toContain('-Line 2');
      expect(diffText).toContain('-Line 3');
      expect(diffText).toContain('+New Line A');
      expect(diffText).toContain('+New Line B');
      expect(diffText).toContain('+New Line C');
    });
  });

  describe('error handling', () => {
    it('should throw error for non-existent file', async () => {
      const context = createTestContext(testDir);

      await expect(
        handleEditFile(
          {
            path: './nonexistent.txt',
            edits: [{ oldText: 'test', newText: 'replacement' }],
            dryRun: false,
          },
          context
        )
      ).rejects.toThrow('File not found: nonexistent.txt');
    });

    it('should throw error when text not found', async () => {
      const originalContent = 'Hello world\nThis is a test';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);

      await expect(
        handleEditFile(
          {
            path: './test.txt',
            edits: [{ oldText: 'nonexistent text', newText: 'replacement' }],
            dryRun: false,
          },
          context
        )
      ).rejects.toThrow('Text not found in file: "nonexistent text"');
    });

    it('should throw error for ambiguous matches', async () => {
      const originalContent = 'test line\nanother test line\nfinal test line';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);

      await expect(
        handleEditFile(
          {
            path: './test.txt',
            edits: [{ oldText: 'test', newText: 'replacement' }],
            dryRun: false,
          },
          context
        )
      ).rejects.toThrow('Ambiguous edit: "test" appears 3 times in the file');
    });

    it('should handle long text in error messages', async () => {
      const originalContent = 'Hello world';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const longText = 'a'.repeat(150);

      await expect(
        handleEditFile(
          {
            path: './test.txt',
            edits: [{ oldText: longText, newText: 'replacement' }],
            dryRun: false,
          },
          context
        )
      ).rejects.toThrow('Text not found in file: "' + 'a'.repeat(100) + '..."');
    });

    it('should throw error for invalid arguments', async () => {
      const context = createTestContext(testDir);

      await expect(
        handleEditFile(
          {
            path: './test.txt',
            dryRun: false,
          },
          context
        )
      ).rejects.toThrow('Invalid arguments for edit_file');
    });
  });

  describe('special characters and edge cases', () => {
    it('should handle special regex characters in text', async () => {
      const originalContent = 'Price: $10.99 (was $15.99)';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [{ oldText: '$10.99', newText: '$12.99' }],
          dryRun: false,
        },
        context
      );

      expect(result.content[0].text).toBe('Successfully applied 1 edit(s) to test.txt');
      expect(await readTestFile(testDir, 'test.txt')).toBe('Price: $12.99 (was $15.99)');
    });

    it('should handle unicode characters', async () => {
      const originalContent = 'Hello 世界\nこんにちは world';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [{ oldText: '世界', newText: 'universe' }],
          dryRun: false,
        },
        context
      );

      expect(result.content[0].text).toBe('Successfully applied 1 edit(s) to test.txt');
      expect(await readTestFile(testDir, 'test.txt')).toBe('Hello universe\nこんにちは world');
    });

    it('should handle empty string replacements', async () => {
      const originalContent = 'Remove this text and keep the rest';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [{ oldText: 'Remove this text and ', newText: '' }],
          dryRun: false,
        },
        context
      );

      expect(result.content[0].text).toBe('Successfully applied 1 edit(s) to test.txt');
      expect(await readTestFile(testDir, 'test.txt')).toBe('keep the rest');
    });

    it('should handle whitespace-only content', async () => {
      const originalContent = '    \n\t\n   ';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [{ oldText: '    ', newText: 'content' }],
          dryRun: false,
        },
        context
      );

      expect(result.content[0].text).toBe('Successfully applied 1 edit(s) to test.txt');
      expect(await readTestFile(testDir, 'test.txt')).toBe('content\n\t\n   ');
    });
  });

  describe('snapshot tests for diff format', () => {
    it('should match expected diff format for single line edit', async () => {
      const originalContent = 'Hello world';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [{ oldText: 'Hello world', newText: 'Hi universe' }],
          dryRun: true,
        },
        context
      );

      const expectedDiff = `Dry run preview for test.txt:

@@ Edit: Replace 1 line(s) with 1 line(s) @@
-Hello world
+Hi universe`;

      expect(result.content[0].text).toBe(expectedDiff);
    });

    it('should match expected diff format for multiline edit', async () => {
      const originalContent = 'Line 1\nLine 2\nLine 3';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [{ oldText: 'Line 1\nLine 2', newText: 'New Line A\nNew Line B\nNew Line C' }],
          dryRun: true,
        },
        context
      );

      const expectedDiff = `Dry run preview for test.txt:

@@ Edit: Replace 2 line(s) with 3 line(s) @@
-Line 1
-Line 2
+New Line A
+New Line B
+New Line C`;

      expect(result.content[0].text).toBe(expectedDiff);
    });

    it('should match expected diff format for multiple edits', async () => {
      const originalContent = 'First\nSecond\nThird';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [
            { oldText: 'First', newText: 'Modified First' },
            { oldText: 'Third', newText: 'Modified Third' },
          ],
          dryRun: true,
        },
        context
      );

      const expectedDiff = `Dry run preview for test.txt:

@@ Edit: Replace 1 line(s) with 1 line(s) @@
-First
+Modified First

@@ Edit: Replace 1 line(s) with 1 line(s) @@
-Third
+Modified Third`;

      expect(result.content[0].text).toBe(expectedDiff);
    });

    it('should match expected diff format for deletion (empty replacement)', async () => {
      const originalContent = 'Keep this\nDelete this line\nKeep this too';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [{ oldText: 'Delete this line\n', newText: '' }],
          dryRun: true,
        },
        context
      );

      const expectedDiff = `Dry run preview for test.txt:

@@ Edit: Replace 2 line(s) with 1 line(s) @@
-Delete this line
-
+`;

      expect(result.content[0].text).toBe(expectedDiff);
    });
  });
});
