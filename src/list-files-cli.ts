import aiDigest from 'ai-digest';
import path from 'path';
import { getIgnoreFile, normalizeDisplayPath } from './handlers/utils.js';

interface ListFilesOptions {
  sortBy: 'size' | 'path';
  reverse: boolean;
  directory: string;
}

export async function listFiles(options: ListFilesOptions) {
  const { sortBy, reverse, directory } = options;

  // Resolve directory path
  const inputDir = path.resolve(directory);

  console.log(`📋 Listing files in: ${inputDir}`);

  try {
    // Check for .cocoignore file
    const ignoreFile = await getIgnoreFile(inputDir);
    if (ignoreFile) {
      console.log(`🚫 Using ignore file: ${ignoreFile}`);
    } else {
      console.log(`🚫 Using default ignore patterns (.aidigestignore)`);
    }

    // Get file statistics
    const stats = await aiDigest.getFileStats({
      inputDir,
      ignoreFile,
      silent: true,
      additionalDefaultIgnores: ['.cocoignore', '.cocominify'],
    });

    const files = stats.files || [];

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

    files.forEach((file, index) => {
      const sizeInKB = (file.sizeInBytes / 1024).toFixed(2);
      const displayPath = normalizeDisplayPath(file.path, inputDir);
      console.log(
        `${(index + 1).toString().padStart(4)}. ${displayPath.padEnd(50)} ${sizeInKB.padStart(10)} KB`
      );
    });
  } catch (error) {
    console.error(
      `❌ Error listing files: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
