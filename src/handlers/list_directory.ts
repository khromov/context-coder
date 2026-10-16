import { ListDirectoryArgsSchema } from '../schemas.js';
import { HandlerContext, HandlerResponse } from '../types.js';
import { resolveSafePath } from './utils.js';
import fs from 'fs/promises';
import logger from '../logger.js';

export async function handleListDirectory(
  args: unknown,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('📋 list_directory handler started');

  const parsed = ListDirectoryArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
  }
  const absolutePath = await resolveSafePath(parsed.data.path, context.absoluteRootDir);
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });
  const formatted = entries
    .map((entry) => `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`)
    .join('\n');

  const result = {
    content: [{ type: 'text', text: formatted }],
  };

  logger.debug(
    `⏱️ list_directory handler finished for path: ${parsed.data.path}, found ${entries.length} entries`
  );
  return result;
}
