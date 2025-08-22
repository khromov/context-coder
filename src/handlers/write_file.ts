import { WriteFileArgsSchema } from '../schemas.js';
import type { HandlerContext, HandlerResponse, ToolInput } from '../types.js';
import { validateRelativePath, resolveRelativePath, formatDisplayPath } from './utils.js';
import { writeFileSecure } from '../file-operations.js';
import fs from 'fs/promises';
import path from 'path';
import logger from '../logger.js';

export async function handleWriteFile(
  args: ToolInput,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('✏️ write_file handler started');

  const parsed = WriteFileArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
  }
  validateRelativePath(parsed.data.path);
  const absolutePath = resolveRelativePath(parsed.data.path, context.absoluteRootDir);

  // Ensure parent directory exists
  const parentDir = path.dirname(absolutePath);
  await fs.mkdir(parentDir, { recursive: true });

  await writeFileSecure(absolutePath, parsed.data.content);

  const displayPath = formatDisplayPath(parsed.data.path);

  const result: HandlerResponse = {
    content: [{ type: 'text', text: `Successfully wrote to ${displayPath}` }],
  };

  logger.debug(
    `⏱️ write_file handler finished for path: ${parsed.data.path}, content length: ${parsed.data.content.length}`
  );
  return result;
}
