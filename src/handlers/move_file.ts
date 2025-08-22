import { MoveFileArgsSchema } from '../schemas.js';
import type { HandlerContext, HandlerResponse, ToolInput } from '../types.js';
import { validateRelativePath, resolveRelativePath, formatDisplayPath } from './utils.js';
import fs from 'fs/promises';
import path from 'path';
import logger from '../logger.js';

export async function handleMoveFile(
  args: ToolInput,
  context: HandlerContext
): Promise<HandlerResponse> {
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

  await fs.rename(absoluteSource, absoluteDest);

  const displaySource = formatDisplayPath(parsed.data.source);
  const displayDest = formatDisplayPath(parsed.data.destination);

  const result: HandlerResponse = {
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
