#!/usr/bin/env node

import { program, InvalidArgumentError } from 'commander';
import logger, { configureLogger } from './logger.js';
import { getVersion } from './lib/version.js';
import { getIgnoreFile, getMinifyFile, getRootDir } from './handlers/utils.js';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_CLAUDE_CODE_PAGE_SIZE,
  DEFAULT_CLAUDE_TOKEN_LIMIT,
  DEFAULT_GPT_TOKEN_LIMIT,
} from './constants.js';

// Options of the main (server) command, as parsed by commander
interface ServerOptions {
  mini?: boolean;
  full?: boolean;
  stdio?: boolean;
  edit?: boolean;
  editFileMode?: boolean;
  port?: number;
  host?: string;
  allowedHosts?: string;
  claudeTokenLimit?: number;
  gptTokenLimit?: number;
  pageSize?: number;
  claudeCodePageSize?: number;
}

// Commander passes the previous value as a second argument, which parseInt would take as the
// radix, so numeric options are parsed here instead
function parsePositiveIntOption(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('Must be a positive whole number.');
  }
  return parsed;
}

/**
 * Check for ignore and minify files and show helpful tips if they don't exist
 */
async function showStartupTips(): Promise<void> {
  try {
    const absoluteRootDir = getRootDir();

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
async function runServer(options: ServerOptions): Promise<void> {
  // Store token limits from command line arguments
  if (options.claudeTokenLimit) {
    process.env.COCO_CLAUDE_TOKEN_LIMIT = options.claudeTokenLimit.toString();
  }
  if (options.gptTokenLimit) {
    process.env.COCO_GPT_TOKEN_LIMIT = options.gptTokenLimit.toString();
  }

  // Store page size from command line argument (don't override env if already set)
  if (options.pageSize) {
    process.env.COCO_PAGE_SIZE = options.pageSize.toString();
  }
  if (options.claudeCodePageSize) {
    process.env.COCO_CLAUDE_CODE_PAGE_SIZE = options.claudeCodePageSize.toString();
  }

  if (options.allowedHosts) {
    process.env.COCO_ALLOWED_HOSTS = options.allowedHosts;
  }

  // Full mode is the default (npx usage); mini must be requested with --mini
  const mode = options.mini ? 'mini' : 'full';

  let transportMode = 'http'; // Default to http
  if (process.env.COCO_MCP_TRANSPORT) {
    transportMode = process.env.COCO_MCP_TRANSPORT;
  } else if (options.stdio) {
    transportMode = 'stdio';
  }

  // Set the mode globally for other modules to access
  process.env.CONTEXT_CODER_MODE = mode;

  if (options.editFileMode || options.edit) {
    process.env.CONTEXT_CODER_EDIT_MODE = 'true';
  }

  // Configure logger with the resolved transport mode
  configureLogger(transportMode);

  // Log startup information
  logger.info(`Current directory: ${process.cwd()}`);

  // Log overrides of the defaults, if any
  if (options.claudeTokenLimit && options.claudeTokenLimit !== DEFAULT_CLAUDE_TOKEN_LIMIT) {
    logger.info(
      `🎯 Claude token limit overridden: ${DEFAULT_CLAUDE_TOKEN_LIMIT.toLocaleString()} -> ${options.claudeTokenLimit.toLocaleString()}`
    );
  }
  if (options.gptTokenLimit && options.gptTokenLimit !== DEFAULT_GPT_TOKEN_LIMIT) {
    logger.info(
      `🎯 GPT token limit overridden: ${DEFAULT_GPT_TOKEN_LIMIT.toLocaleString()} -> ${options.gptTokenLimit.toLocaleString()}`
    );
  }
  if (options.pageSize && options.pageSize !== DEFAULT_PAGE_SIZE) {
    logger.info(
      `📄 get_codebase page size overridden: ${DEFAULT_PAGE_SIZE.toLocaleString()} -> ${options.pageSize.toLocaleString()} characters`
    );
  }
  if (options.claudeCodePageSize && options.claudeCodePageSize !== DEFAULT_CLAUDE_CODE_PAGE_SIZE) {
    logger.info(
      `📄 Claude Code page size guidance overridden: ${DEFAULT_CLAUDE_CODE_PAGE_SIZE.toLocaleString()} -> ${options.claudeCodePageSize.toLocaleString()} characters`
    );
  }

  try {
    // Transports are imported only now, after the env vars above are set: tools.ts reads
    // them at module load time to build the tool list and descriptions
    if (transportMode === 'stdio') {
      const { startStdioServer } = await import('./stdio.js');
      await startStdioServer();
    } else {
      const { startHttpServer } = await import('./streamableHttp.js');
      await startHttpServer(options.port, options.host);
    }

    // Show startup tips about ignore and minify files
    await showStartupTips();
  } catch (error) {
    logger.error(`Error running server: ${error instanceof Error ? error.message : String(error)}`);
    logger.debug('Error details:', error);
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
  .option('-p, --port <number>', 'port to listen on (default: 3001)', parsePositiveIntOption)
  .option(
    '--host <address>',
    'address to listen on in HTTP mode (default: 127.0.0.1, this computer only; 0.0.0.0 listens on all interfaces)'
  )
  .option(
    '--allowed-hosts <hosts>',
    'comma-separated hostnames to accept in the Host and Origin headers in HTTP mode, besides localhost'
  )
  .option(
    '-c, --claude-token-limit <number>',
    'set Claude token limit warning - going over this limit will issue a warning when calling get_codebase_size (default: 150000)',
    parsePositiveIntOption
  )
  .option(
    '-g, --gpt-token-limit <number>',
    'set GPT token limit warning - going over this limit will issue a warning when calling get_codebase_size (default: 128000)',
    parsePositiveIntOption
  )
  .option(
    '--page-size <number>',
    'set the get_codebase pagination page size in characters (default: 99000; Claude Desktop caps pages at 100000 characters)',
    parsePositiveIntOption
  )
  .option(
    '--claude-code-page-size <number>',
    'set the _pageSize value the model is told to use when running under Claude Code - this value is reported in the get_codebase tool description (default: 30000)',
    parsePositiveIntOption
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
