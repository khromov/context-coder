import { ListDirectoryArgsSchema } from '../schemas.js';
import type { HandlerContext, HandlerResponse, ToolInput } from '../types.js';
import { validateRelativePath, resolveRelativePath } from './utils.js';
import fs from 'fs/promises';
import logger from '../logger.js';

export async function handleListDirectory(
  args: ToolInput,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('📋 list_directory handler started');

  const parsed = ListDirectoryArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
  }
  validateRelativePath(parsed.data.path);
  const absolutePath = resolveRelativePath(parsed.data.path, context.absoluteRootDir);
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });
  const formatted = entries
    .map((entry) => `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`)
    .join('\n');

  const result: HandlerResponse = {
    content: [{ type: 'text', text: formatted }],
  };

  logger.debug(
    `⏱️ list_directory handler finished for path: ${parsed.data.path}, found ${entries.length} entries`
  );
  return result;
}
