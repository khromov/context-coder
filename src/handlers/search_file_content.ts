import { SearchFileContentArgsSchema } from '../schemas.js';
import { HandlerContext, HandlerResponse } from '../types.js';
import { validateRelativePath, resolveRelativePath, normalizeDisplayPath } from './utils.js';
import fs from 'fs/promises';
import path from 'path';
import { minimatch } from 'minimatch';
import { isBinaryFile } from 'isbinaryfile';
import ignore from 'ignore';
import { DEFAULT_IGNORES } from '../constants.js';
import logger from '../logger.js';

interface SearchMatch {
  file: string;
  lineNumber: number;
  line: string;
  context: string[];
  matchedText: string;
  contextStartLine: number; // Track the actual starting line of the context
}

export async function handleSearchFileContent(
  args: any,
  context: HandlerContext
): Promise<HandlerResponse> {
  const parsed = SearchFileContentArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for search_file_content: ${parsed.error}`);
  }

  logger.info(
    `🔍 search_file_content handler started: pattern "${parsed.data.pattern}", path ${parsed.data.path}, includeAllFiles: ${parsed.data.includeAllFiles}`
  );

  validateRelativePath(parsed.data.path);
  const absolutePath = resolveRelativePath(parsed.data.path, context.absoluteRootDir);

  try {
    const matches = await searchFileContent(
      absolutePath,
      parsed.data.pattern,
      {
        useRegex: parsed.data.useRegex,
        caseSensitive: parsed.data.caseSensitive,
        contextLines: parsed.data.contextLines,
        maxResults: parsed.data.maxResults,
        excludePatterns: parsed.data.excludePatterns,
        includeAllFiles: parsed.data.includeAllFiles,
      },
      context.absoluteRootDir
    );

    let resultText = '';

    if (matches.length === 0) {
      resultText = `No matches found for pattern "${parsed.data.pattern}"`;

      // If no matches found and not including all files, suggest trying with includeAllFiles=true
      if (!parsed.data.includeAllFiles) {
        resultText += `\n\n💡 **Tip**: No matches found. If you think the pattern should match something, try setting \`includeAllFiles: true\` to search files that might be excluded by .cocoignore patterns.`;
      }
    } else {
      resultText = `Found ${matches.length} match(es) for pattern "${parsed.data.pattern}":\n\n`;

      // Group matches by file
      const matchesByFile = new Map<string, SearchMatch[]>();
      for (const match of matches) {
        if (!matchesByFile.has(match.file)) {
          matchesByFile.set(match.file, []);
        }
        matchesByFile.get(match.file)!.push(match);
      }

      // Format results by file
      for (const [filePath, fileMatches] of matchesByFile) {
        resultText += `📄 **${filePath}** (${fileMatches.length} match${fileMatches.length > 1 ? 'es' : ''})\n`;

        for (const match of fileMatches) {
          resultText += `\n**Line ${match.lineNumber}:** \`${match.matchedText}\`\n`;
          resultText += '\`\`\`\n';

          // Add context lines with correct line numbers
          if (match.context.length > 0) {
            for (let i = 0; i < match.context.length; i++) {
              const contextLineNumber = match.contextStartLine + i;
              const isMatchLine = contextLineNumber === match.lineNumber;
              const prefix = isMatchLine ? '> ' : '  ';
              resultText += `${prefix}${contextLineNumber}: ${match.context[i]}\n`;
            }
          }

          resultText += '\`\`\`\n';
        }

        resultText += '\n';
      }

      if (matches.length >= parsed.data.maxResults) {
        resultText += `\n⚠️ Search limited to ${parsed.data.maxResults} results. Use more specific patterns or increase maxResults to see more matches.\n`;
      }
    }

    const result = {
      content: [{ type: 'text', text: resultText }],
    };

    logger.info(
      `⏱️ search_file_content handler finished: found ${matches.length} matches for pattern "${parsed.data.pattern}"`
    );
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`⏱️ search_file_content handler finished with error: ${errorMessage}`);
    throw new Error(`Failed to search file content: ${errorMessage}`);
  }
}

async function searchFileContent(
  rootPath: string,
  pattern: string,
  options: {
    useRegex: boolean;
    caseSensitive: boolean;
    contextLines: number;
    maxResults: number;
    excludePatterns: string[];
    includeAllFiles: boolean;
  },
  projectRoot: string
): Promise<SearchMatch[]> {
  const matches: SearchMatch[] = [];
  let totalMatches = 0;

  // Create regex pattern
  let searchRegex: RegExp;
  try {
    if (options.useRegex) {
      // Remove global flag 'g' to avoid state issues with repeated calls
      const flags = options.caseSensitive ? '' : 'i';
      searchRegex = new RegExp(pattern, flags);
    } else {
      // Escape special regex characters for literal search
      const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Remove global flag 'g' to avoid state issues with repeated calls
      const flags = options.caseSensitive ? '' : 'i';
      searchRegex = new RegExp(escapedPattern, flags);
    }
  } catch (error) {
    throw new Error(
      `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Set up ignore patterns based on includeAllFiles flag
  const ig = ignore();
  if (!options.includeAllFiles) {
    // Add default ignores and .cocoignore patterns
    ig.add(DEFAULT_IGNORES);

    // Try to read .cocoignore file if it exists
    try {
      const cocoIgnorePath = path.join(projectRoot, '.cocoignore');
      const cocoIgnoreContent = await fs.readFile(cocoIgnorePath, 'utf-8');
      ig.add(cocoIgnoreContent);
    } catch {
      // .cocoignore doesn't exist, that's fine
    }
  }

  // Define binary file extensions to skip (as fallback to isbinaryfile)
  const binaryExtensions = new Set([
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.bin',
    '.dat',
    '.db',
    '.sqlite',
    '.sqlite3',
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.bmp',
    '.ico',
    '.svg',
    '.webp',
    '.tiff',
    '.mp3',
    '.mp4',
    '.avi',
    '.mov',
    '.wmv',
    '.flv',
    '.webm',
    '.mkv',
    '.wav',
    '.flac',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.zip',
    '.rar',
    '.7z',
    '.gz',
    '.tar',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.otf',
  ]);

  // Helper function to check if a path should be excluded based on exclude patterns
  function shouldExcludeFile(relativePath: string): boolean {
    return options.excludePatterns.some((excludePattern) => {
      if (excludePattern.includes('*')) {
        return minimatch(relativePath, excludePattern, { dot: true });
      } else {
        // Match files directly inside the directory and in any subdirectory
        const patterns = [
          `**/${excludePattern}/**`, // files in subdirectories
          `**/${excludePattern}/*`, // files directly inside the directory
        ];
        return patterns.some((pattern) => minimatch(relativePath, pattern, { dot: true }));
      }
    });
  }

  async function searchInFile(filePath: string): Promise<void> {
    if (totalMatches >= options.maxResults) {
      return;
    }

    // Calculate relative path for ignore checking
    const relativePath = path.relative(projectRoot, filePath);

    // Check if file should be ignored (only if not including all files)
    if (!options.includeAllFiles && ig.ignores(relativePath)) {
      return;
    }

    // Skip binary files based on extension (quick check)
    const ext = path.extname(filePath).toLowerCase();
    if (binaryExtensions.has(ext)) {
      return;
    }

    // Check exclude patterns with improved logic
    if (shouldExcludeFile(relativePath)) {
      return;
    }

    try {
      // Use isbinaryfile to check if file is binary
      const isBinary = await isBinaryFile(filePath);
      if (isBinary) {
        logger.debug(`Skipping binary file: ${filePath}`);
        return;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length && totalMatches < options.maxResults; i++) {
        const line = lines[i];

        // Use matchAll instead of match to avoid executing regex twice
        const lineMatches = Array.from(
          line.matchAll(new RegExp(searchRegex.source, searchRegex.flags + 'g'))
        );

        for (const match of lineMatches) {
          if (totalMatches >= options.maxResults) {
            break;
          }

          // Get context lines with proper bounds checking
          const contextStart = Math.max(0, i - options.contextLines);
          const contextEnd = Math.min(lines.length, i + options.contextLines + 1);
          const contextLines = lines.slice(contextStart, contextEnd);

          const displayPath = normalizeDisplayPath(filePath, projectRoot);

          matches.push({
            file: displayPath,
            lineNumber: i + 1, // 1-based line numbers
            line: line,
            context: contextLines,
            matchedText: match[0],
            contextStartLine: contextStart + 1, // 1-based line number for context start
          });

          totalMatches++;
        }
      }
    } catch (error) {
      // Skip files that can't be read as text or processed
      if ((error as any).code !== 'EISDIR') {
        logger.debug(
          `Skipping file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  async function searchDirectory(currentPath: string): Promise<void> {
    if (totalMatches >= options.maxResults) {
      return;
    }

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (totalMatches >= options.maxResults) {
          break;
        }

        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(projectRoot, fullPath);

        try {
          if (entry.isDirectory()) {
            // Check if directory should be ignored (only if not including all files)
            if (!options.includeAllFiles && ig.ignores(relativePath)) {
              continue;
            }

            // Skip common directories that usually contain non-searchable content
            // (only when not including all files)
            if (!options.includeAllFiles) {
              const skipDirs = new Set([
                'node_modules',
                '.git',
                '.svn',
                '.hg',
                'dist',
                'build',
                'target',
                'vendor',
                '__pycache__',
                '.venv',
                'venv',
                'ENV',
                'env',
                '.cache',
                '.turbo',
                '.next',
                '.nuxt',
                '.svelte-kit',
                'coverage',
              ]);

              if (skipDirs.has(entry.name)) {
                continue;
              }
            }

            await searchDirectory(fullPath);
          } else if (entry.isFile()) {
            await searchInFile(fullPath);
          }
        } catch (error) {
          // Skip entries that can't be accessed
          logger.debug(
            `Skipping ${fullPath}: ${error instanceof Error ? error.message : String(error)}`
          );
          continue;
        }
      }
    } catch (error) {
      // Skip directories that can't be read
      logger.debug(
        `Cannot read directory ${currentPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Start the search
  const stats = await fs.stat(rootPath);
  if (stats.isFile()) {
    await searchInFile(rootPath);
  } else if (stats.isDirectory()) {
    await searchDirectory(rootPath);
  }

  return matches;
}
