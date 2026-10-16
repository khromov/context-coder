import { ReadFileArgsSchema } from '../schemas.js';
import { HandlerContext, HandlerResponse } from '../types.js';
import { resolveSafePath } from './utils.js';
import fs from 'fs/promises';
import logger from '../logger.js';

export async function handleReadFile(
  args: unknown,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('📖 read_file handler started');

  const parsed = ReadFileArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for read_file: ${parsed.error}`);
  }

  const absolutePath = await resolveSafePath(parsed.data.path, context.absoluteRootDir);

  const content = await fs.readFile(absolutePath, 'utf-8');

  const result = {
    content: [{ type: 'text', text: content }],
  };

  logger.debug(
    `⏱️ read_file handler finished for path: ${parsed.data.path}, content length: ${content.length}`
  );
  return result;
}
