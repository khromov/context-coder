import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { handleEditFile } from '../../handlers/edit_file.js';
import {
  setupTestDir,
  cleanupTestDir,
  createTestContext,
  readTestFile,
  createTestFile,
} from './test-utils.js';

const itPosix = process.platform === 'win32' ? it.skip : it;

const AMBIGUOUS_MATCH_ERROR =
  'Found 3 matches of the string to replace, but replaceAll is false. To replace all occurrences, set replaceAll to true. To replace only one occurrence, please provide more context to uniquely identify the instance.';

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

    itPosix('should keep the permissions of the edited file', async () => {
      await createTestFile(testDir, 'run.sh', '#!/bin/sh\necho old\n');
      await fs.chmod(path.join(testDir, 'run.sh'), 0o755);

      const context = createTestContext(testDir);
      await handleEditFile(
        { path: 'run.sh', edits: [{ oldText: 'echo old', newText: 'echo new' }] },
        context
      );

      const { mode } = await fs.stat(path.join(testDir, 'run.sh'));
      expect(mode & 0o777).toBe(0o755);
    });
  });

  describe('replacement text is inserted literally', () => {
    // String.replace would expand these patterns: $' inserts the text after the match,
    // $` the text before it, $& the match itself, and $$ becomes a single $
    it.each([["IFS=$'\\n'"], ['echo "pid: $$"'], ['wrap($&)'], ['before $` after']])(
      'should keep %s exactly as written',
      async (newText) => {
        await createTestFile(testDir, 'script.sh', 'start\nPLACEHOLDER\nend\n');

        const context = createTestContext(testDir);
        await handleEditFile(
          { path: 'script.sh', edits: [{ oldText: 'PLACEHOLDER', newText }] },
          context
        );

        expect(await readTestFile(testDir, 'script.sh')).toBe(`start\n${newText}\nend\n`);
      }
    );

    it('should keep $ patterns literal with replaceAll', async () => {
      await createTestFile(testDir, 'prices.txt', 'X and X');

      const context = createTestContext(testDir);
      await handleEditFile(
        { path: 'prices.txt', edits: [{ oldText: 'X', newText: '$$5' }], replaceAll: true },
        context
      );

      expect(await readTestFile(testDir, 'prices.txt')).toBe('$$5 and $$5');
    });
  });

  describe('line endings', () => {
    it('should match LF text against a CRLF file and keep CRLF line endings', async () => {
      await createTestFile(testDir, 'crlf.txt', 'one\r\ntwo\r\nthree\r\n');

      const context = createTestContext(testDir);
      await handleEditFile(
        { path: 'crlf.txt', edits: [{ oldText: 'one\ntwo', newText: 'uno\ndos\nextra' }] },
        context
      );

      expect(await readTestFile(testDir, 'crlf.txt')).toBe('uno\r\ndos\r\nextra\r\nthree\r\n');
    });

    it('should use CRLF for new lines added to a CRLF file', async () => {
      await createTestFile(testDir, 'crlf.txt', 'one\r\ntwo\r\n');

      const context = createTestContext(testDir);
      await handleEditFile(
        { path: 'crlf.txt', edits: [{ oldText: 'two', newText: 'two\nthree' }] },
        context
      );

      expect(await readTestFile(testDir, 'crlf.txt')).toBe('one\r\ntwo\r\nthree\r\n');
    });

    it('should edit LF sections of a file with mixed line endings as they are', async () => {
      await createTestFile(testDir, 'mixed.txt', 'a\r\nb\nc\n');

      const context = createTestContext(testDir);
      await handleEditFile(
        { path: 'mixed.txt', edits: [{ oldText: 'b\nc', newText: 'x\ny' }] },
        context
      );

      expect(await readTestFile(testDir, 'mixed.txt')).toBe('a\r\nx\ny\n');
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

    it('should apply edits in order in a dry run, like a real edit', async () => {
      await createTestFile(testDir, 'test.txt', 'alpha');

      const context = createTestContext(testDir);
      // The second edit matches text the first one creates
      const result = await handleEditFile(
        {
          path: 'test.txt',
          edits: [
            { oldText: 'alpha', newText: 'beta' },
            { oldText: 'beta', newText: 'gamma' },
          ],
          dryRun: true,
        },
        context
      );

      expect(result.content[0].text).toContain('+gamma');
      expect(await readTestFile(testDir, 'test.txt')).toBe('alpha');
    });

    it('should report text that is not found in a dry run', async () => {
      await createTestFile(testDir, 'test.txt', 'Hello world');

      const context = createTestContext(testDir);
      await expect(
        handleEditFile(
          { path: 'test.txt', edits: [{ oldText: 'missing', newText: 'x' }], dryRun: true },
          context
        )
      ).rejects.toThrow('Text not found in file: "missing"');
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

    it('should throw error for ambiguous matches when replaceAll is false', async () => {
      const originalContent = 'test line\nanother test line\nfinal test line';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);

      await expect(
        handleEditFile(
          {
            path: './test.txt',
            edits: [{ oldText: 'test', newText: 'replacement' }],
            dryRun: false,
            replaceAll: false,
          },
          context
        )
      ).rejects.toThrow(AMBIGUOUS_MATCH_ERROR);
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

    it('should reject an empty oldText', async () => {
      await createTestFile(testDir, 'test.txt', 'abc');
      const context = createTestContext(testDir);

      await expect(
        handleEditFile({ path: 'test.txt', edits: [{ oldText: '', newText: 'x' }] }, context)
      ).rejects.toThrow('Invalid arguments for edit_file');
      expect(await readTestFile(testDir, 'test.txt')).toBe('abc');
    });

    it('should not write anything when a later edit fails', async () => {
      await createTestFile(testDir, 'test.txt', 'one two');
      const context = createTestContext(testDir);

      await expect(
        handleEditFile(
          {
            path: 'test.txt',
            edits: [
              { oldText: 'one', newText: '1' },
              { oldText: 'missing', newText: 'x' },
            ],
          },
          context
        )
      ).rejects.toThrow('Text not found');
      expect(await readTestFile(testDir, 'test.txt')).toBe('one two');
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

  describe('replaceAll functionality', () => {
    it('should replace all occurrences when replaceAll is true', async () => {
      const originalContent = 'test line\nanother test line\nfinal test line';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [{ oldText: 'test', newText: 'replacement' }],
          dryRun: false,
          replaceAll: true,
        },
        context
      );

      expect(result.content[0].text).toBe('Successfully applied 1 edit(s) to test.txt');
      expect(await readTestFile(testDir, 'test.txt')).toBe(
        'replacement line\nanother replacement line\nfinal replacement line'
      );
    });

    it('should work normally with single match regardless of replaceAll value', async () => {
      const originalContent = 'unique text\nother content';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);

      const resultFalse = await handleEditFile(
        {
          path: './test.txt',
          edits: [{ oldText: 'unique text', newText: 'modified text' }],
          dryRun: false,
          replaceAll: false,
        },
        context
      );

      expect(resultFalse.content[0].text).toBe('Successfully applied 1 edit(s) to test.txt');
      expect(await readTestFile(testDir, 'test.txt')).toBe('modified text\nother content');

      await createTestFile(testDir, 'test2.txt', originalContent);

      const resultTrue = await handleEditFile(
        {
          path: './test2.txt',
          edits: [{ oldText: 'unique text', newText: 'modified text' }],
          dryRun: false,
          replaceAll: true,
        },
        context
      );

      expect(resultTrue.content[0].text).toBe('Successfully applied 1 edit(s) to test2.txt');
      expect(await readTestFile(testDir, 'test2.txt')).toBe('modified text\nother content');
    });

    it('should generate correct diff preview with replaceAll true and multiple matches', async () => {
      const originalContent = 'test line\nanother test line\nfinal test line';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [{ oldText: 'test', newText: 'replacement' }],
          dryRun: true,
          replaceAll: true,
        },
        context
      );

      expect(result.content[0].text).toContain('Dry run preview for test.txt:');
      expect(result.content[0].text).toContain('@@ Edit: Replace 1 line(s) with 1 line(s) @@');
      expect(result.content[0].text).toContain('-test');
      expect(result.content[0].text).toContain('+replacement');

      expect(await readTestFile(testDir, 'test.txt')).toBe(originalContent);
    });

    it('should handle multiple edits with replaceAll true', async () => {
      const originalContent = 'foo bar\nfoo baz\nother foo content';
      await createTestFile(testDir, 'test.txt', originalContent);

      const context = createTestContext(testDir);
      const result = await handleEditFile(
        {
          path: './test.txt',
          edits: [
            { oldText: 'foo', newText: 'replaced' },
            { oldText: 'bar', newText: 'modified' },
          ],
          dryRun: false,
          replaceAll: true,
        },
        context
      );

      expect(result.content[0].text).toBe('Successfully applied 2 edit(s) to test.txt');
      expect(await readTestFile(testDir, 'test.txt')).toBe(
        'replaced modified\nreplaced baz\nother replaced content'
      );
    });

    it('should throw error for multiple matches with default replaceAll (false)', async () => {
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
      ).rejects.toThrow(AMBIGUOUS_MATCH_ERROR);
    });

    it('should accept the replaceAll argument named in the error message', async () => {
      await createTestFile(testDir, 'test.txt', 'test line\nanother test line\nfinal test line');
      const context = createTestContext(testDir);

      const error = await handleEditFile(
        { path: 'test.txt', edits: [{ oldText: 'test', newText: 'x' }] },
        context
      ).catch((e: Error) => e);
      // Retrying with the argument the error message names must work
      expect(String(error)).toContain('set replaceAll to true');

      await handleEditFile(
        { path: 'test.txt', edits: [{ oldText: 'test', newText: 'x' }], replaceAll: true },
        context
      );
      expect(await readTestFile(testDir, 'test.txt')).toBe('x line\nanother x line\nfinal x line');
    });
  });
});
