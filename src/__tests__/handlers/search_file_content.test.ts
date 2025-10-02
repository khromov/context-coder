import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { handleSearchFileContent } from '../../handlers/search_file_content.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('search_file_content handler', () => {
  const testDir = path.join(__dirname, 'test-search-temp');
  const context = { absoluteRootDir: testDir };

  beforeAll(async () => {
    // Create test directory and files
    await fs.mkdir(testDir, { recursive: true });

    // Create test files with different content
    await fs.writeFile(
      path.join(testDir, 'test1.ts'),
      `function testFunction() {
  console.log("Hello world");
  return 42;
}

export default testFunction;`
    );

    await fs.writeFile(
      path.join(testDir, 'test2.js'),
      `// This file contains console statements
console.log("Starting application");

function main() {
  console.error("Error occurred");
  return true;
}

module.exports = { main };`
    );

    await fs.writeFile(
      path.join(testDir, 'config.json'),
      `{
  "name": "test-app",
  "version": "1.0.0",
  "description": "A test application"
}`
    );

    // Create a file specifically for testing line number accuracy
    await fs.writeFile(
      path.join(testDir, 'line-test.txt'),
      `line 1
line 2 with target
line 3
line 4
line 5`
    );

    // Create a file for testing multiple matches on same line
    await fs.writeFile(
      path.join(testDir, 'multi-match.txt'),
      `This line has test and test and test patterns
Another line with single test
Final line test test test`
    );

    // Create a .cocoignore file to test ignore functionality
    await fs.writeFile(
      path.join(testDir, '.cocoignore'),
      `*.json
node_modules/
dist/`
    );

    // Create a file that would be ignored
    await fs.writeFile(
      path.join(testDir, 'ignored.json'),
      `{
  "ignored": true,
  "test": "this should not be found"
}`
    );

    // Create a node_modules directory with files to test exclude pattern logic
    await fs.mkdir(path.join(testDir, 'node_modules'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'node_modules', 'subdir'), { recursive: true });

    // File directly in node_modules
    await fs.writeFile(
      path.join(testDir, 'node_modules', 'module.js'),
      `// This is in node_modules
console.log("I should be ignored by default");
var moduleTest = "test pattern in node_modules";`
    );

    // File in node_modules subdirectory
    await fs.writeFile(
      path.join(testDir, 'node_modules', 'subdir', 'nested.js'),
      `// This is in node_modules/subdir
var nestedTest = "test pattern in nested node_modules";`
    );

    // Create dist directory with file to test directory exclusion
    await fs.mkdir(path.join(testDir, 'dist'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'dist', 'bundle.js'),
      `// This is in dist
var distTest = "test pattern in dist";`
    );

    // Create regular directory that shouldn't be excluded
    await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'src', 'app.js'),
      `// This is in src
var srcTest = "test pattern in src";`
    );
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should display correct line numbers and context markers', async () => {
    const args = {
      path: '',
      pattern: 'target',
      useRegex: false,
      caseSensitive: false,
      contextLines: 2,
      maxResults: 10,
      excludePatterns: [],
      includeAllFiles: false,
    };

    const result = await handleSearchFileContent(args, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;
    expect(text).toContain('Found');
    expect(text).toContain('line-test.txt');
    expect(text).toContain('Line 2:'); // Should report line 2

    // Check that the context shows correct line numbers and marker
    expect(text).toContain('  1: line 1'); // Line before match
    expect(text).toContain('> 2: line 2 with target'); // Match line with marker
    expect(text).toContain('  3: line 3'); // Line after match
    expect(text).toContain('  4: line 4'); // Second line after match

    // Should NOT contain line 0 (bug was showing 0-based indexing)
    expect(text).not.toContain('  0:');
    expect(text).not.toContain('> 0:');
  });

  // Test for Fix #1: Exclude pattern logic for directories
  it('should correctly exclude files directly in directories and subdirectories with exclude patterns', async () => {
    const args = {
      path: '',
      pattern: 'moduleTest',
      useRegex: false,
      caseSensitive: false,
      contextLines: 1,
      maxResults: 10,
      excludePatterns: ['node_modules'], // Should exclude both direct files and subdirectory files
      includeAllFiles: true, // Include all files to override .cocoignore, only test excludePatterns
    };

    const result = await handleSearchFileContent(args, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;

    // Should NOT find files directly in node_modules OR in subdirectories
    expect(text).toContain('No matches found');
    expect(text).not.toContain('node_modules/module.js');
    expect(text).not.toContain('node_modules/subdir/nested.js');
    // The pattern name will appear in "No matches found for pattern ..." message, that's expected
  });

  // Test for Fix #1: Exclude pattern logic for glob patterns
  it('should correctly handle glob patterns in exclude patterns', async () => {
    const args = {
      path: '',
      pattern: 'distTest',
      useRegex: false,
      caseSensitive: false,
      contextLines: 1,
      maxResults: 10,
      excludePatterns: ['**/dist/**'], // Glob pattern
      includeAllFiles: true,
    };

    const result = await handleSearchFileContent(args, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;

    // Should not find files in dist due to glob pattern exclusion
    expect(text).toContain('No matches found');
    expect(text).not.toContain('dist/bundle.js');
    // The pattern name will appear in "No matches found for pattern ..." message, that's expected
  });

  // Test for Fix #3: Multiple matches on same line (regex execution optimization)
  it('should find multiple matches on the same line without issues', async () => {
    const args = {
      path: '',
      pattern: 'test',
      useRegex: false,
      caseSensitive: false,
      contextLines: 0,
      maxResults: 50, // Increase to see all matches
      excludePatterns: [],
      includeAllFiles: false,
    };

    const result = await handleSearchFileContent(args, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;

    // Should find the file with multiple matches
    expect(text).toContain('multi-match.txt');

    // Check that multiple matches on the same line are captured
    // Line 1 has 3 occurrences of "test", should show 3 separate match entries
    const line1Matches = (text.match(/Line 1:/g) || []).length;
    expect(line1Matches).toBeGreaterThanOrEqual(3); // At least 3 matches on line 1

    // Line 3 has 3 occurrences of "test", should show 3 separate match entries
    const line3Matches = (text.match(/Line 3:/g) || []).length;
    expect(line3Matches).toBeGreaterThanOrEqual(3); // At least 3 matches on line 3
  });

  // Test for Fix #4: Global flag state issue
  it('should handle multiple sequential searches without state interference', async () => {
    const args1 = {
      path: '',
      pattern: 'console',
      useRegex: false,
      caseSensitive: false,
      contextLines: 0,
      maxResults: 5,
      excludePatterns: [],
      includeAllFiles: false,
    };

    const args2 = {
      path: '',
      pattern: 'function',
      useRegex: false,
      caseSensitive: false,
      contextLines: 0,
      maxResults: 5,
      excludePatterns: [],
      includeAllFiles: false,
    };

    // First search
    const result1 = await handleSearchFileContent(args1, context);
    expect(result1.content).toHaveLength(1);
    const text1 = result1.content[0].text;
    expect(text1).toContain('console');

    // Second search - should work independently
    const result2 = await handleSearchFileContent(args2, context);
    expect(result2.content).toHaveLength(1);
    const text2 = result2.content[0].text;
    expect(text2).toContain('function');

    // Third search - repeat first search to ensure no state pollution
    const result3 = await handleSearchFileContent(args1, context);
    expect(result3.content).toHaveLength(1);
    const text3 = result3.content[0].text;
    expect(text3).toContain('console');

    // Results should be consistent
    expect(text1).toEqual(text3);
  });

  // Test for Fix #4: Regex global flag state with regex patterns
  it('should handle regex patterns without global flag state issues', async () => {
    const args = {
      path: '',
      pattern: 't.st', // regex pattern that matches "test"
      useRegex: true,
      caseSensitive: false,
      contextLines: 0,
      maxResults: 10,
      excludePatterns: [],
      includeAllFiles: false,
    };

    // Run search multiple times to ensure regex state doesn't interfere
    const result1 = await handleSearchFileContent(args, context);
    const result2 = await handleSearchFileContent(args, context);
    const result3 = await handleSearchFileContent(args, context);

    // All results should be identical
    expect(result1.content[0].text).toEqual(result2.content[0].text);
    expect(result2.content[0].text).toEqual(result3.content[0].text);

    // Should find matches consistently
    expect(result1.content[0].text).toContain('Found');
    expect(result2.content[0].text).toContain('Found');
    expect(result3.content[0].text).toContain('Found');
  });

  it('should search for literal text and return matches with context', async () => {
    const args = {
      path: '',
      pattern: 'console.log',
      useRegex: false,
      caseSensitive: false,
      contextLines: 1,
      maxResults: 10,
      excludePatterns: [],
      includeAllFiles: false,
    };

    const result = await handleSearchFileContent(args, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;
    expect(text).toContain('Found');
    expect(text).toContain('console.log');
    expect(text).toContain('test1.ts');
    expect(text).toContain('test2.js');
    // Should not contain ignored files
    expect(text).not.toContain('node_modules');
  });

  it('should support regex patterns', async () => {
    const args = {
      path: '',
      pattern: 'console\\.(log|error)',
      useRegex: true,
      caseSensitive: false,
      contextLines: 1,
      maxResults: 10,
      excludePatterns: [],
      includeAllFiles: false,
    };

    const result = await handleSearchFileContent(args, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;
    expect(text).toContain('Found');
    expect(text).toContain('match');
  });

  it('should respect case sensitivity option', async () => {
    const args = {
      path: '',
      pattern: 'CONSOLE',
      useRegex: false,
      caseSensitive: true,
      contextLines: 1,
      maxResults: 10,
      excludePatterns: [],
      includeAllFiles: false,
    };

    const result = await handleSearchFileContent(args, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;
    expect(text).toContain('No matches found');
  });

  it('should exclude files based on patterns', async () => {
    const args = {
      path: '',
      pattern: 'test',
      useRegex: false,
      caseSensitive: false,
      contextLines: 1,
      maxResults: 10,
      excludePatterns: ['*.ts'],
      includeAllFiles: false,
    };

    const result = await handleSearchFileContent(args, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;
    // Should not find matches in .ts files due to exclusion
    expect(text).not.toContain('test1.ts');
  });

  it('should respect .cocoignore by default (includeAllFiles=false)', async () => {
    const args = {
      path: '',
      pattern: 'test',
      useRegex: false,
      caseSensitive: false,
      contextLines: 1,
      maxResults: 10,
      excludePatterns: [],
      includeAllFiles: false,
    };

    const result = await handleSearchFileContent(args, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;
    // Should not find matches in ignored files (.json files are in .cocoignore)
    expect(text).not.toContain('config.json');
    expect(text).not.toContain('ignored.json');
    expect(text).not.toContain('node_modules');
  });

  it('should ignore .cocoignore when includeAllFiles=true', async () => {
    const args = {
      path: '',
      pattern: 'moduleTest',
      useRegex: false,
      caseSensitive: false,
      contextLines: 1,
      maxResults: 10,
      excludePatterns: [],
      includeAllFiles: true,
    };

    const result = await handleSearchFileContent(args, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;
    // Should find matches in previously ignored files
    expect(text).toContain('node_modules');
    expect(text).toContain('moduleTest');
  });

  it('should provide tip when no matches found with includeAllFiles=false', async () => {
    const args = {
      path: '',
      pattern: 'nonexistentpattern123',
      useRegex: false,
      caseSensitive: false,
      contextLines: 1,
      maxResults: 10,
      excludePatterns: [],
      includeAllFiles: false,
    };

    const result = await handleSearchFileContent(args, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const text = result.content[0].text;
    expect(text).toContain('No matches found');
    expect(text).toContain('includeAllFiles: true');
  });

  it('should not provide tip when no matches found with includeAllFiles=true', async () => {
    const args = {
      path: '',
      pattern: 'nonexistentpattern123',
      useRegex: false,
      caseSensitive: false,
      contextLines: 1,
      maxResults: 10,
      excludePatterns: [],
      includeAllFiles: true,
    };

    const result = await handleSearchFileContent(args, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const text = result.content[0].text;
    expect(text).toContain('No matches found');
    expect(text).not.toContain('includeAllFiles: true');
  });

  it('should handle empty results', async () => {
    const args = {
      path: '',
      pattern: 'nonexistentpattern123',
      useRegex: false,
      caseSensitive: false,
      contextLines: 1,
      maxResults: 10,
      excludePatterns: [],
      includeAllFiles: false,
    };

    const result = await handleSearchFileContent(args, context);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('No matches found');
  });

  it('should validate invalid regex patterns', async () => {
    const args = {
      path: '',
      pattern: '[invalid regex',
      useRegex: true,
      caseSensitive: false,
      contextLines: 1,
      maxResults: 10,
      excludePatterns: [],
      includeAllFiles: false,
    };

    await expect(handleSearchFileContent(args, context)).rejects.toThrow(/Invalid regex pattern/);
  });
});
