import fs from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { minimatch } from 'minimatch';
import ignore from 'ignore';
import { TreeEntry } from './types.js';
import { DEFAULT_IGNORES } from './constants.js';

// Search files recursively
export async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = []
): Promise<string[]> {
  const results: string[] = [];

  async function search(currentPath: string) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        try {
          // Check if path matches any exclude pattern
          // Glob patterns use forward slashes, so normalize Windows separators first
          const relativePath = path.relative(rootPath, fullPath).split(path.sep).join('/');
          const shouldExclude = excludePatterns.some((pattern) => {
            const globPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
            return minimatch(relativePath, globPattern, { dot: true });
          });

          if (shouldExclude) {
            continue;
          }

          if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
            results.push(fullPath);
          }

          if (entry.isDirectory()) {
            await search(fullPath);
          }
        } catch {
          // Skip paths that can't be accessed
          continue;
        }
      }
    } catch {
      // Skip directories that can't be read
      return;
    }
  }

  await search(rootPath);
  return results;
}

// Line ending normalization
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

// Build directory tree recursively
export async function buildTree(
  currentPath: string,
  allowedDirectories: string[],
  rootPath?: string
): Promise<TreeEntry[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const result: TreeEntry[] = [];

  // Initialize ignore instance with default patterns
  const ig = ignore().add(DEFAULT_IGNORES);

  // Determine the root path for relative path calculation
  const baseRootPath = rootPath || currentPath;

  for (const entry of entries) {
    // Calculate relative path from root for ignore checking
    const fullPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(baseRootPath, fullPath);

    // Check if this entry should be ignored
    if (ig.ignores(relativePath)) {
      continue;
    }

    const entryData: TreeEntry = {
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
    };

    if (entry.isDirectory()) {
      entryData.children = await buildTree(fullPath, allowedDirectories, baseRootPath);
    }

    result.push(entryData);
  }

  return result;
}

// Write file with security considerations
export async function writeFileSecure(filePath: string, content: string): Promise<void> {
  try {
    // 'wx' flag ensures exclusive creation - fails if file exists
    await fs.writeFile(filePath, content, { encoding: 'utf-8', flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      // Use atomic rename for existing files
      const tempPath = `${filePath}.${randomBytes(16).toString('hex')}.tmp`;
      try {
        await fs.writeFile(tempPath, content, 'utf-8');
        await fs.rename(tempPath, filePath);
      } catch (renameError) {
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }
        throw renameError;
      }
    } else {
      throw error;
    }
  }
}
