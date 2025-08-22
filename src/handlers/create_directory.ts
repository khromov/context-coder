import { CreateDirectoryArgsSchema } from '../schemas.js';
import type { HandlerContext, HandlerResponse, ToolInput } from '../types.js';
import { validateRelativePath, resolveRelativePath, formatDisplayPath } from './utils.js';
import fs from 'fs/promises';
import logger from '../logger.js';

export async function handleCreateDirectory(
  args: ToolInput,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('📁 create_directory handler started');

  const parsed = CreateDirectoryArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for create_directory: ${parsed.error}`);
  }
  validateRelativePath(parsed.data.path);
  const absolutePath = resolveRelativePath(parsed.data.path, context.absoluteRootDir);

  // Check if directory already exists
  let directoryExisted = false;
  try {
    const stats = await fs.stat(absolutePath);
    directoryExisted = stats.isDirectory();
  } catch {
    // Directory doesn't exist, which is expected
  }

  await fs.mkdir(absolutePath, { recursive: true });

  const displayPath = formatDisplayPath(parsed.data.path);

  const message = directoryExisted
    ? `Directory ${displayPath} already exists`
    : `Successfully created directory ${displayPath}`;

  const result: HandlerResponse = {
    content: [{ type: 'text', text: message }],
  };

  logger.debug(`⏱️ create_directory handler finished for path: ${parsed.data.path}`);
  return result;
}
