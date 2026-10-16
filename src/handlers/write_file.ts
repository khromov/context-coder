import { WriteFileArgsSchema } from '../schemas.js';
import { HandlerContext, HandlerResponse } from '../types.js';
import { resolveSafePath, formatDisplayPath } from './utils.js';
import { writeFileSecure } from '../file-operations.js';
import fs from 'fs/promises';
import path from 'path';
import logger from '../logger.js';

export async function handleWriteFile(
  args: unknown,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('✏️ write_file handler started');

  const parsed = WriteFileArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
  }
  // A symlink inside the root is written through to its target, which stays inside the root
  const absolutePath = await resolveSafePath(parsed.data.path, context.absoluteRootDir);

  // Ensure parent directory exists
  const parentDir = path.dirname(absolutePath);
  await fs.mkdir(parentDir, { recursive: true });

  await writeFileSecure(absolutePath, parsed.data.content);

  const displayPath = formatDisplayPath(parsed.data.path);

  const result = {
    content: [{ type: 'text', text: `Successfully wrote to ${displayPath}` }],
  };

  logger.debug(
    `⏱️ write_file handler finished for path: ${parsed.data.path}, content length: ${parsed.data.content.length}`
  );
  return result;
}
