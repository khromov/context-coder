import { RemoveFileArgsSchema } from '../schemas.js';
import type { HandlerContext, HandlerResponse, ToolInput } from '../types.js';
import { validateRelativePath, resolveRelativePath, formatDisplayPath } from './utils.js';
import fs from 'fs/promises';
import logger from '../logger.js';

export async function handleRemoveFile(
  args: ToolInput,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('🗑️ remove_file handler started');

  const parsed = RemoveFileArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for remove_file: ${parsed.error}`);
  }

  validateRelativePath(parsed.data.path);
  const absolutePath = resolveRelativePath(parsed.data.path, context.absoluteRootDir);

  try {
    // Check if file exists and get file info
    const stats = await fs.stat(absolutePath);

    if (stats.isDirectory()) {
      throw new Error(
        `Cannot remove directory with remove_file. Use rm with execute_command instead.`
      );
    }

    // Remove the file
    await fs.unlink(absolutePath);

    const displayPath = formatDisplayPath(parsed.data.path);

    const result: HandlerResponse = {
      content: [{ type: 'text', text: `Successfully removed file ${displayPath}` }],
    };

    logger.debug(`⏱️ remove_file handler finished for path: ${parsed.data.path}`);
    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File not found: ${formatDisplayPath(parsed.data.path)}`);
    }
    throw error;
  }
}
