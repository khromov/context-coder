import { ReadFileArgsSchema } from '../schemas.js';
import type { HandlerContext, HandlerResponse, ToolInput } from '../types.js';
import { validateRelativePath, resolveRelativePath } from './utils.js';
import fs from 'fs/promises';
import logger from '../logger.js';

export async function handleReadFile(
  args: ToolInput,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('📖 read_file handler started');

  const parsed = ReadFileArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for read_file: ${parsed.error}`);
  }

  validateRelativePath(parsed.data.path);
  const absolutePath = resolveRelativePath(parsed.data.path, context.absoluteRootDir);

  const content = await fs.readFile(absolutePath, 'utf-8');

  const result: HandlerResponse = {
    content: [{ type: 'text', text: content }],
  };

  logger.debug(
    `⏱️ read_file handler finished for path: ${parsed.data.path}, content length: ${content.length}`
  );
  return result;
}
