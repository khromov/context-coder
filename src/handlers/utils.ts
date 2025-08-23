import path from 'path';
import fs from 'fs/promises';
import type { MinifyFileDescriptionCallback } from 'ai-digest';

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
 * Check if .cocoignore file exists in the given directory
 * @param inputDir - The directory to check for .cocoignore
 * @returns '.cocoignore' if it exists, undefined otherwise (to fallback to .aidigestignore)
 */
export async function getIgnoreFile(inputDir: string): Promise<string | undefined> {
  try {
    const cocoIgnorePath = path.join(inputDir, '.cocoignore');
    await fs.access(cocoIgnorePath);
    return '.cocoignore';
  } catch {
    // .cocoignore doesn't exist, let ai-digest use default .aidigestignore
    return undefined;
  }
}

/**
 * Check if .cocominify file exists in the given directory
 * @param inputDir - The directory to check for .cocominify
 * @returns '.cocominify' if it exists, undefined otherwise (to fallback to .aidigestminify)
 */
export async function getMinifyFile(inputDir: string): Promise<string | undefined> {
  try {
    const cocoMinifyPath = path.join(inputDir, '.cocominify');
    await fs.access(cocoMinifyPath);
    return '.cocominify';
  } catch {
    // .cocominify doesn't exist, let ai-digest use default .aidigestminify
    return undefined;
  }
}

/**
 * Custom minify file description that tells the AI it can read the file
 * @param metadata - File metadata from ai-digest
 * @returns Custom minify message with read_file instruction
 */
export const getMinifyFileDescription: MinifyFileDescriptionCallback = (metadata) => {
  return (
    `# ${metadata.displayPath}\n\n` +
    `This file has been minified to save tokens. The file exists at the above location.\n` +
    `You can use the read_file tool to read the actual content if necessary.\n\n`
  );
};
