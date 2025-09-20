#!/usr/bin/env node

import { program } from 'commander';
import logger, { configureLogger } from './logger.js';
import { getVersion } from './lib/version.js';
import { getIgnoreFile, getMinifyFile } from './handlers/utils.js';
import path from 'path';

/**
 * Check for ignore and minify files and show helpful tips if they don't exist
 */
async function showStartupTips(): Promise<void> {
  try {
    // Determine the root directory based on environment
    const ROOT_DIR = process.env.COCO_DEV === 'true' ? './mount' : './';
    const absoluteRootDir = path.resolve(ROOT_DIR);

    const ignoreFile = await getIgnoreFile(absoluteRootDir);
    const minifyFile = await getMinifyFile(absoluteRootDir);

    if (!ignoreFile) {
      logger.info(
        '💡 Tip: Did you know that you can add a .cocoignore file to exclude specific files and directories from the codebase analysis?'
      );
    }

    if (!minifyFile) {
      logger.info(
        '💡 Tip: Did you know that you can add a .cocominify file to include files with placeholder content instead of excluding them entirely?'
      );
    }
  } catch (error) {
    // Silently ignore errors during tip checking - this is non-critical
    logger.debug('Error checking for ignore/minify files during startup tips:', error);
  }
}

// Async function to run the server
async function runServer(options: any, _command: any) {
  // Store port from command line argument (don't override env)
  const serverPort = options.port;

  // Store token limits from command line arguments
  if (options.claudeTokenLimit) {
    process.env.COCO_CLAUDE_TOKEN_LIMIT = options.claudeTokenLimit.toString();
  }
  if (options.gptTokenLimit) {
    process.env.COCO_GPT_TOKEN_LIMIT = options.gptTokenLimit.toString();
  }

  // Determine mode based on command line flags
  // Default to full for npx usage, mini/full passed explicitly by Docker entrypoint
  let isFullMode = true; // Default to full

  if (options.mini) {
    isFullMode = false;
  } else if (options.full) {
    isFullMode = true;
  }

  let transportMode = 'http'; // Default to http
  if (process.env.COCO_MCP_TRANSPORT) {
    transportMode = process.env.COCO_MCP_TRANSPORT;
  } else if (options.stdio) {
    transportMode = 'stdio';
  }

  // Set the mode globally for other modules to access
  const mode = isFullMode ? 'full' : 'mini';
  process.env.CONTEXT_CODER_MODE = mode;

  if (options.editFileMode || options.edit) {
    process.env.CONTEXT_CODER_EDIT_MODE = 'true';
  }

  // Configure logger with the resolved transport mode
  configureLogger(transportMode);

  // Log startup information
  logger.info(`Current directory: ${process.cwd()}`);

  // Log token limit overrides if any
  const defaultClaudeLimit = 150000;
  const defaultGptLimit = 128000;

  if (options.claudeTokenLimit && options.claudeTokenLimit !== defaultClaudeLimit) {
    logger.info(
      `🎯 Claude token limit overridden: ${defaultClaudeLimit.toLocaleString()} -> ${options.claudeTokenLimit.toLocaleString()}`
    );
  }
  if (options.gptTokenLimit && options.gptTokenLimit !== defaultGptLimit) {
    logger.info(
      `🎯 GPT token limit overridden: ${defaultGptLimit.toLocaleString()} -> ${options.gptTokenLimit.toLocaleString()}`
    );
  }

  try {
    if (transportMode === 'stdio') {
      const { startStdioServer } = await import('./stdio.js');
      await startStdioServer();
    } else {
      const { startHttpServer } = await import('./streamableHttp.js');
      await startHttpServer(serverPort);
    }

    // Show startup tips about ignore and minify files
    await showStartupTips();
  } catch (error) {
    logger.error('Error running server:', error);
    process.exit(1);
  }
}

// Configure the main program
program
  .version(getVersion())
  .name('context-coder')
  .description('Context Coder: MCP server for full-context coding')
  .option('-m, --mini', 'run in mini mode (only core tools)')
  .option('-f, --full', 'run in full mode (all tools)')
  .option('-s, --stdio', 'use stdio transport instead of HTTP')
  .option('-e, --edit', 'use edit_file tool instead of write_file (partial edits)')
  .option('--edit-file-mode', 'use edit_file tool instead of write_file (partial edits)')
  .option('-p, --port <number>', 'port to listen on (default: 3001)', parseInt)
  .option(
    '-c, --claude-token-limit <number>',
    'set Claude token limit warning - going over this limit will issue a warning when calling get_codebase_size (default: 150000)',
    parseInt
  )
  .option(
    '-g, --gpt-token-limit <number>',
    'set GPT token limit warning - going over this limit will issue a warning when calling get_codebase_size (default: 128000)',
    parseInt
  )
  .action(runServer);

// Add the 'ls' subcommand
program
  .command('ls')
  .description('List all files that will be included in the codebase analysis')
  .option('--sort-by <type>', 'Sort by "size" or "path"', 'size')
  .option('-r, --reverse', 'Reverse sort order (ascending instead of descending)')
  .option('-d, --directory <dir>', 'Directory to analyze', '.')
  .action(async (options) => {
    // Import and run the list functionality
    const { listFiles } = await import('./list-files-cli.js');
    await listFiles(options);
  });

// Parse command line arguments
program.parse(process.argv);
