import { MoveFileArgsSchema } from '../schemas.js';
import { HandlerContext, HandlerResponse } from '../types.js';
import { resolveSafePath, formatDisplayPath } from './utils.js';
import fs from 'fs/promises';
import path from 'path';
import logger from '../logger.js';

export async function handleMoveFile(
  args: unknown,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('🚚 move_file handler started');

  const parsed = MoveFileArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
  }
  // Moving a symlink moves the link itself, so don't follow it
  const absoluteSource = await resolveSafePath(parsed.data.source, context.absoluteRootDir, {
    followFinalSymlink: false,
  });
  const absoluteDest = await resolveSafePath(parsed.data.destination, context.absoluteRootDir, {
    followFinalSymlink: false,
  });

  // Ensure destination parent directory exists
  const destParentDir = path.dirname(absoluteDest);
  await fs.mkdir(destParentDir, { recursive: true });

  await fs.rename(absoluteSource, absoluteDest);

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
