import fs from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { minimatch } from 'minimatch';
import ignore from 'ignore';
import { TreeEntry } from './types.js';
import { DEFAULT_IGNORES, SEARCH_SKIPPED_DIRECTORIES } from './constants.js';

const isWindows = process.platform === 'win32';

// Matcher for the default ignore patterns, built once and shared
const defaultIgnore = ignore().add(DEFAULT_IGNORES);

// Path relative to a root with forward slashes, as glob and ignore patterns expect
function toPosixRelativePath(rootPath: string, fullPath: string): string {
  return path.relative(rootPath, fullPath).split(path.sep).join('/');
}

// Search files recursively
export async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = []
): Promise<string[]> {
  const results: string[] = [];
  const lowerCasePattern = pattern.toLowerCase();

  async function search(currentPath: string): Promise<void> {
    // Skip directories that can't be read
    const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => undefined);
    if (!entries) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      // Check if path matches any exclude pattern
      const relativePath = toPosixRelativePath(rootPath, fullPath);
      const shouldExclude = excludePatterns.some((excludePattern) => {
        const globPattern = excludePattern.includes('*')
          ? excludePattern
          : `**/${excludePattern}/**`;
        return minimatch(relativePath, globPattern, { dot: true });
      });

      if (shouldExclude) {
        continue;
      }

      if (entry.name.toLowerCase().includes(lowerCasePattern)) {
        results.push(fullPath);
      }

      // Don't descend into dependency, version control and cache folders such as
      // node_modules and .git, which can hold huge numbers of files. Searching from
      // inside one of them still works, since only child folders are skipped.
      if (entry.isDirectory() && !SEARCH_SKIPPED_DIRECTORIES.has(entry.name)) {
        await search(fullPath);
      }
    }
  }

  await search(rootPath);
  return results;
}

// Line ending normalization
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

// Build directory tree recursively, skipping entries that match the default ignores.
// rootPath is the directory ignore patterns are matched relative to.
export async function buildTree(
  currentPath: string,
  rootPath: string = currentPath
): Promise<TreeEntry[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const result: TreeEntry[] = [];

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);

    // Check if this entry should be ignored
    if (defaultIgnore.ignores(toPosixRelativePath(rootPath, fullPath))) {
      continue;
    }

    const entryData: TreeEntry = {
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
    };

    if (entry.isDirectory()) {
      entryData.children = await buildTree(fullPath, rootPath);
    }

    result.push(entryData);
  }

  return result;
}

export interface RenameWithRetryOptions {
  /** Retry on lock errors. Defaults to true on Windows only. */
  retry?: boolean;
  /** Give up after this many milliseconds. */
  timeoutMs?: number;
  /** The rename to perform, replaceable in tests. */
  rename?: (from: string, to: string) => Promise<void>;
}

const RETRYABLE_RENAME_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY']);

/**
 * Rename a file, replacing the destination. On Windows, the rename fails with EPERM, EACCES or
 * EBUSY while something else has the destination open or is replacing it: a concurrent write,
 * an editor, antivirus or the search indexer. Those locks are brief, so the rename is retried
 * with a short backoff for up to about a second, as graceful-fs does.
 */
export async function renameWithRetry(
  from: string,
  to: string,
  { retry = isWindows, timeoutMs = 1000, rename = fs.rename }: RenameWithRetryOptions = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (let delay = 10; ; delay = Math.min(delay * 2, 100)) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryable = retry && code !== undefined && RETRYABLE_RENAME_ERRORS.has(code);
      if (!retryable || Date.now() + delay > deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Write a file so readers never see it half-written
export async function writeFileSecure(filePath: string, content: string): Promise<void> {
  try {
    // 'wx' flag ensures exclusive creation - fails if file exists
    await fs.writeFile(filePath, content, { encoding: 'utf-8', flag: 'wx' });
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }

  // The file exists: write a temp file next to it, then rename it into place atomically
  const tempPath = `${filePath}.${randomBytes(16).toString('hex')}.tmp`;
  try {
    await fs.writeFile(tempPath, content, { encoding: 'utf-8', flag: 'wx' });
    if (!isWindows) {
      // A new file gets default permissions, so copy the original's (e.g. the executable
      // bit). Windows has no permission bits to copy.
      const { mode } = await fs.stat(filePath);
      await fs.chmod(tempPath, mode & 0o7777);
    }
    await renameWithRetry(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {
      // Ignore cleanup errors
    });
    throw error;
  }
}
