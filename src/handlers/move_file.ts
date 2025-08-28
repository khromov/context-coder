import { MoveFileArgsSchema } from '../schemas.js';
import { HandlerContext, HandlerResponse } from '../types.js';
import { validateRelativePath, resolveRelativePath, formatDisplayPath } from './utils.js';
import { isGitAvailable, isInsideGitRepository, gitMove } from '../utils/git.js';
import fs from 'fs/promises';
import path from 'path';
import logger from '../logger.js';

export async function handleMoveFile(args: any, context: HandlerContext): Promise<HandlerResponse> {
  logger.debug('🚚 move_file handler started');

  const parsed = MoveFileArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
  }
  validateRelativePath(parsed.data.source);
  validateRelativePath(parsed.data.destination);
  const absoluteSource = resolveRelativePath(parsed.data.source, context.absoluteRootDir);
  const absoluteDest = resolveRelativePath(parsed.data.destination, context.absoluteRootDir);

  // Ensure destination parent directory exists
  const destParentDir = path.dirname(absoluteDest);
  await fs.mkdir(destParentDir, { recursive: true });

  // Try to use git mv if available and in a git repository
  const gitAvailable = await isGitAvailable();
  const inGitRepo = gitAvailable ? await isInsideGitRepository(context.absoluteRootDir) : false;

  if (gitAvailable && inGitRepo) {
    try {
      await gitMove(parsed.data.source, parsed.data.destination, context.absoluteRootDir);
      logger.info(`🎯 Used git mv for: ${parsed.data.source} -> ${parsed.data.destination}`);
    } catch (error) {
      logger.debug(`⚠️ git mv failed, falling back to fs.rename: ${error}`);
      await fs.rename(absoluteSource, absoluteDest);
      logger.info(
        `📁 Used fs.rename fallback for: ${parsed.data.source} -> ${parsed.data.destination}`
      );
    }
  } else {
    await fs.rename(absoluteSource, absoluteDest);
    if (!gitAvailable) {
      logger.debug('📁 Using fs.rename: git not available');
    } else if (!inGitRepo) {
      logger.debug('📁 Using fs.rename: not in git repository');
    }
  }

  const displaySource = formatDisplayPath(parsed.data.source);
  const displayDest = formatDisplayPath(parsed.data.destination);

  const result = {
    content: [
      {
        type: 'text',
        text: `Successfully moved ${displaySource} to ${displayDest}`,
      },
    ],
  };

  logger.debug(
    `⏱️ move_file handler finished: ${parsed.data.source} -> ${parsed.data.destination}`
  );
  return result;
}
