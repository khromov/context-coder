import aiDigest from 'ai-digest';
import path from 'path';
import {
  getIgnoreFile,
  getMinifyFile,
  getMinifyFileDescription,
  normalizeDisplayPath,
} from './handlers/utils.js';

interface ListFilesOptions {
  sortBy: 'size' | 'path';
  reverse: boolean;
  directory: string;
}

export async function listFiles(options: ListFilesOptions) {
  const { sortBy, reverse, directory } = options;

  // Resolve directory path, accounting for dev mode
  let resolvedDirectory = directory;
  if (process.env.COCO_DEV === 'true' && directory === '.') {
    // In dev mode, default to the mount directory instead of current directory
    resolvedDirectory = './mount';
  }
  const inputDir = path.resolve(resolvedDirectory);

  console.log(`📋 Listing files in: ${inputDir}`);

  try {
    // Check for .cocoignore file
    const ignoreFile = await getIgnoreFile(inputDir);
    if (ignoreFile) {
      console.log(`🚫 Using ignore file: ${ignoreFile}`);
    } else {
      console.log(`🚫 Using default ignore patterns (.aidigestignore)`);
    }

    // Check for .cocominify file
    const minifyFile = await getMinifyFile(inputDir);
    if (minifyFile) {
      console.log(`🗜️ Using minify file: ${minifyFile}`);
    } else {
      console.log(`🗜️ Using default minify patterns (.aidigestminify)`);
    }

    // Get file statistics
    const stats = await aiDigest.getFileStats({
      inputDir,
      ignoreFile,
      minifyFile,
      silent: true,
      additionalDefaultIgnores: ['.cocoignore', '.cocominify'],
    });

    const files = stats.files || [];

    // Use the shared minify file description function
    const minifyFileDescription = getMinifyFileDescription;

    // Also get the detailed content to identify which files are minified
    const { files: contentFiles } = await aiDigest.generateDigestFiles({
      inputDir,
      ignoreFile,
      minifyFile,
      minifyFileDescription,
      silent: true,
      additionalDefaultIgnores: ['.cocoignore', '.cocominify'],
    });

    // Create a set of minified file names for quick lookup
    const minifiedFiles = new Set<string>();
    contentFiles.forEach((file) => {
      if (
        file.content.includes('(File exists but content excluded via .aidigestminify)') ||
        file.content.includes('This file has been minified to save tokens')
      ) {
        minifiedFiles.add(file.fileName);
      }
    });

    // Sort files
    if (sortBy === 'size') {
      files.sort((a, b) =>
        reverse ? a.sizeInBytes - b.sizeInBytes : b.sizeInBytes - a.sizeInBytes
      );
    } else {
      files.sort((a, b) => {
        const aPath = normalizeDisplayPath(a.path, inputDir);
        const bPath = normalizeDisplayPath(b.path, inputDir);
        return reverse ? bPath.localeCompare(aPath) : aPath.localeCompare(bPath);
      });
    }

    console.log(`\n📊 Summary:`);
    console.log(`- Total files: ${files.length}`);
    console.log(`- Claude tokens: ${stats.totalClaudeTokens.toLocaleString()}`);
    console.log(`- ChatGPT tokens: ${stats.totalGptTokens.toLocaleString()}`);

    console.log(`\n📁 Files (sorted by ${sortBy}${reverse ? ' ascending' : ' descending'}):`);
    console.log('='.repeat(80));

    let hasMinifiedFiles = false;
    files.forEach((file, index) => {
      const sizeInKB = (file.sizeInBytes / 1024).toFixed(2);
      const displayPath = normalizeDisplayPath(file.path, inputDir);
      const isMinified = minifiedFiles.has(file.path);
      if (isMinified) hasMinifiedFiles = true;

      const minifyIndicator = isMinified ? ' *' : '';
      console.log(
        `${(index + 1).toString().padStart(4)}. ${displayPath}${minifyIndicator}${' '.repeat(50 - displayPath.length - minifyIndicator.length)} ${sizeInKB.padStart(10)} KB`
      );
    });

    // Add legend if there are minified files
    if (hasMinifiedFiles) {
      console.log('\n* = File content has been minified to save tokens');
    }
  } catch (error) {
    console.error(
      `❌ Error listing files: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
