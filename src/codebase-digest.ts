import aiDigest from 'ai-digest';
import { getIgnoreFile, getMinifyFile, getMinifyFileDescription } from './handlers/utils.js';
import { getConfiguredPageSize, getMode } from './constants.js';
import logger from './logger.js';

export interface CodebaseDigestOptions {
  inputDir: string;
  page?: number;
  pageSize?: number;
}

export interface CodebaseDigestResult {
  content: string;
  hasMorePages: boolean;
  currentPage: number;
  nextPage?: number;
}

/**
 * Generate a paginated codebase digest using ai-digest
 * Large files (> pageSize) are replaced with omission messages
 */
export async function generateCodebaseDigest(
  options: CodebaseDigestOptions
): Promise<CodebaseDigestResult> {
  const { inputDir, page = 1, pageSize = getConfiguredPageSize() } = options;

  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`page must be a positive whole number (got: ${page})`);
  }
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error(`pageSize must be a positive whole number (got: ${pageSize})`);
  }

  // Check for .cocoignore file
  const ignoreFile = await getIgnoreFile(inputDir);
  if (ignoreFile) {
    logger.debug(`📋 Using ignore file: ${ignoreFile}`);
  }

  // Check for .cocominify file
  const minifyFile = await getMinifyFile(inputDir);
  if (minifyFile) {
    logger.debug(`📋 Using minify file: ${minifyFile}`);
  }

  // Use the shared minify file description function
  const minifyFileDescription = getMinifyFileDescription;

  // Mini mode has no read_file tool, so point the model at its own file tools there
  const readHint =
    getMode() === 'mini'
      ? 'Read it with your own file tools if you need it.'
      : 'Use the read_file tool to read it if you need it.';

  // Get individual file objects from ai-digest
  const { files } = await aiDigest.generateDigestFiles({
    inputDir,
    ignoreFile,
    minifyFile,
    minifyFileDescription,
    silent: true,
    additionalDefaultIgnores: ['.cocoignore', '.cocominify'],
  });

  // Build array of pages - each page is an array of file contents
  const pages: string[][] = [];
  let currentPageFiles: string[] = [];
  let currentPageCharCount = 0;

  for (const file of files) {
    let fileContent = file.content;
    let fileCharCount = fileContent.length;

    // If file is larger than page size, replace with omission message
    if (fileCharCount > pageSize) {
      const omissionMessage = `# ${file.fileName}\nFile omitted due to large size (${fileCharCount.toLocaleString()} characters). ${readHint}\n`;
      fileContent = omissionMessage;
      fileCharCount = omissionMessage.length;
    }

    // Check if adding this file would exceed the page size
    if (currentPageCharCount + fileCharCount > pageSize && currentPageFiles.length > 0) {
      // Save current page and start a new one
      pages.push(currentPageFiles);
      currentPageFiles = [];
      currentPageCharCount = 0;
    }

    // Add file to current page
    currentPageFiles.push(fileContent);
    currentPageCharCount += fileCharCount;
  }

  // Don't forget the last page if it has content
  if (currentPageFiles.length > 0) {
    pages.push(currentPageFiles);
  }

  // Get the requested page content (empty when the page is beyond the last one)
  const currentPageContent = pages[page - 1]?.join('') ?? '';

  // Check if there are more pages
  const hasMorePages = page < pages.length;

  const footer = hasMorePages
    ? `\n---\nThis is page ${page}. You MUST call this tool again with page: ${page + 1} to get the rest of the files.\n`
    : // We're on the last page of a multi-page digest, or beyond the last page
      `\n---\nThis is the last page (page ${page}). Do NOT call this tool again - you have received the complete codebase.\n`;

  return {
    content: currentPageContent + footer,
    hasMorePages,
    currentPage: page,
    nextPage: hasMorePages ? page + 1 : undefined,
  };
}
