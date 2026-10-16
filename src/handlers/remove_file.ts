import { RemoveFileArgsSchema } from '../schemas.js';
import { HandlerContext, HandlerResponse } from '../types.js';
import { resolveSafePath, formatDisplayPath } from './utils.js';
import fs from 'fs/promises';
import logger from '../logger.js';

export async function handleRemoveFile(
  args: unknown,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('🗑️ remove_file handler started');

  const parsed = RemoveFileArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for remove_file: ${parsed.error}`);
  }

  // Don't follow a symlink in the last segment: removing a link removes the link, not its target
  const absolutePath = await resolveSafePath(parsed.data.path, context.absoluteRootDir, {
    followFinalSymlink: false,
  });

  try {
    // Check if file exists and get file info
    const stats = await fs.lstat(absolutePath);

    if (stats.isDirectory()) {
      throw new Error(
        `Cannot remove directory with remove_file. Use rm with execute_command instead.`
      );
    }

    // Remove the file
    await fs.unlink(absolutePath);

    const displayPath = formatDisplayPath(parsed.data.path);

    const result = {
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
