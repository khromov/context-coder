import path from 'path';
import fs from 'fs/promises';
import { realpathSync } from 'fs';
import type { MinifyFileDescriptionCallback } from 'ai-digest';
import { getMode } from '../constants.js';

/**
 * The directory the tools operate on: ./mount in development (COCO_DEV=true), otherwise the
 * working directory. Symlinks are resolved so it compares cleanly with resolved paths.
 */
export function getRootDir(): string {
  const rootDir = path.resolve(process.env.COCO_DEV === 'true' ? './mount' : './');
  try {
    return realpathSync(rootDir);
  } catch {
    return rootDir;
  }
}

export function validateRelativePath(relativePath: string): void {
  // Handle empty path as current directory
  if (!relativePath || relativePath === '') {
    return;
  }

  // Check for parent directory references in the original path before normalization
  // This catches cases like '../', './..', 'src/../', etc.
  const pathToCheck =
    relativePath.startsWith('./') || relativePath === '.' ? relativePath : './' + relativePath;

  // Split the path and check each segment for exact parent directory references
  // Use both forward slashes and the platform's path separator to handle cross-platform paths
  const segments = pathToCheck.replace(/\\/g, '/').split('/');

  for (const segment of segments) {
    // Check for exact parent directory references
    if (segment === '..') {
      throw new Error(`Path cannot contain parent directory references (got: ${relativePath})`);
    }
  }

  // Additional check: normalize the path and ensure it doesn't escape the current directory
  const normalized = path.normalize(pathToCheck);

  // If the normalized path starts with '../' or is exactly '..', it's trying to escape
  if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('..\\')) {
    throw new Error(`Path cannot contain parent directory references (got: ${relativePath})`);
  }
}

export function resolveRelativePath(relativePath: string, rootDir: string): string {
  // Handle empty path or current directory references as root directory
  if (!relativePath || relativePath === '' || relativePath === '.') {
    return rootDir;
  }

  // Strip leading './' if present
  const cleanPath = relativePath.startsWith('./') ? relativePath.slice(2) : relativePath;
  return path.join(rootDir, cleanPath);
}

export interface ResolveSafePathOptions {
  /**
   * Resolve a symlink in the last path segment to its target (the default). Pass false to
   * act on the link itself, e.g. when removing or moving it.
   */
  followFinalSymlink?: boolean;
}

/**
 * Validate a user-supplied relative path and resolve it to an absolute path inside the root
 * directory. Symlinks are resolved, so a link that leads outside the root is rejected instead
 * of followed. The path does not have to exist yet: its nearest existing parent is checked.
 */
export async function resolveSafePath(
  relativePath: string,
  rootDir: string,
  { followFinalSymlink = true }: ResolveSafePathOptions = {}
): Promise<string> {
  validateRelativePath(relativePath);
  const absolutePath = resolveRelativePath(relativePath, rootDir);
  const realRoot = await fs.realpath(rootDir);

  if (!followFinalSymlink && path.resolve(absolutePath) !== path.resolve(rootDir)) {
    const realParent = await resolveExistingPath(
      path.dirname(absolutePath),
      realRoot,
      relativePath
    );
    return path.join(realParent, path.basename(absolutePath));
  }

  return resolveExistingPath(absolutePath, realRoot, relativePath);
}

// Resolve symlinks in the longest part of absolutePath that exists, check that it stays inside
// realRoot, then add back the segments that don't exist yet
async function resolveExistingPath(
  absolutePath: string,
  realRoot: string,
  displayPath: string
): Promise<string> {
  const missingSegments: string[] = [];
  let current = absolutePath;

  for (;;) {
    let realPath: string | undefined;
    try {
      realPath = await fs.realpath(current);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw error;
      }
      // realpath also fails for a symlink whose target is missing. Where it would lead is
      // unknown, so refuse it rather than create something through it.
      if (await isSymlink(current)) {
        throw new Error(`Path goes through a broken symlink (got: ${displayPath})`);
      }
    }

    if (realPath !== undefined) {
      if (!isInside(realPath, realRoot)) {
        throw new Error(
          `Path leads outside the root directory through a symlink (got: ${displayPath})`
        );
      }
      return missingSegments.length > 0
        ? path.join(realPath, ...missingSegments.reverse())
        : realPath;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Path is outside the root directory (got: ${displayPath})`);
    }
    missingSegments.push(path.basename(current));
    current = parent;
  }
}

async function isSymlink(filePath: string): Promise<boolean> {
  try {
    return (await fs.lstat(filePath)).isSymbolicLink();
  } catch {
    return false;
  }
}

function isInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return (
    relative === '' ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
  );
}

/**
 * Format a path for display by removing the leading './' if present.
 * This provides cleaner output in user-facing messages.
 *
 * @param filePath - The path to format
 * @returns The formatted path without leading './'
 *
 * @example
 * formatDisplayPath('./src/index.ts') // returns 'src/index.ts'
 * formatDisplayPath('src/index.ts')   // returns 'src/index.ts'
 * formatDisplayPath('')               // returns '(root)'
 * formatDisplayPath('.')              // returns '(root)'
 * formatDisplayPath('./')             // returns '(root)'
 */
export function formatDisplayPath(filePath: string): string {
  // Handle empty path or current directory references
  if (!filePath || filePath === '' || filePath === '.' || filePath === './') {
    return '(root)';
  }

  // Remove leading './' if present
  return filePath.startsWith('./') ? filePath.slice(2) : filePath;
}

/**
 * Normalize a file path for display by converting absolute paths to relative paths
 * and handling paths that are already relative.
 *
 * @param filePath - The file path to normalize
 * @param inputDir - The input directory to make paths relative to
 * @returns The normalized path for display
 */
export function normalizeDisplayPath(filePath: string, inputDir: string): string {
  return path.isAbsolute(filePath) ? path.relative(inputDir, filePath) : filePath;
}

/**
 * Check for .cocoignore or .aidigestignore file in the given directory
 * @param inputDir - The directory to check for ignore files
 * @returns The name of the ignore file found, or undefined if neither exists
 */
export async function getIgnoreFile(inputDir: string): Promise<string | undefined> {
  try {
    const cocoIgnorePath = path.join(inputDir, '.cocoignore');
    await fs.access(cocoIgnorePath);
    return '.cocoignore';
  } catch {
    // .cocoignore doesn't exist, try .aidigestignore
    try {
      const aidigestIgnorePath = path.join(inputDir, '.aidigestignore');
      await fs.access(aidigestIgnorePath);
      return '.aidigestignore';
    } catch {
      // Neither file exists
      return undefined;
    }
  }
}

/**
 * Check for .cocominify or .aidigestminify file in the given directory
 * @param inputDir - The directory to check for minify files
 * @returns The name of the minify file found, or undefined if neither exists
 */
export async function getMinifyFile(inputDir: string): Promise<string | undefined> {
  try {
    const cocoMinifyPath = path.join(inputDir, '.cocominify');
    await fs.access(cocoMinifyPath);
    return '.cocominify';
  } catch {
    // .cocominify doesn't exist, try .aidigestminify
    try {
      const aidigestMinifyPath = path.join(inputDir, '.aidigestminify');
      await fs.access(aidigestMinifyPath);
      return '.aidigestminify';
    } catch {
      // Neither file exists
      return undefined;
    }
  }
}

/**
 * Custom minify file description that tells the AI how it can read the file.
 * Mini mode has no read_file tool, so the model is pointed at its own file tools instead.
 * @param metadata - File metadata from ai-digest
 * @returns Custom minify message with a read instruction
 */
export const getMinifyFileDescription: MinifyFileDescriptionCallback = (metadata) => {
  const readHint =
    getMode() === 'mini'
      ? 'Read the file with your own file tools if you need its actual content.'
      : 'You can use the read_file tool to read the actual content if necessary.';
  return (
    `# ${metadata.displayPath}\n\n` +
    `This file has been minified to save tokens. The file exists at the above location.\n` +
    `${readHint}\n\n`
  );
};
