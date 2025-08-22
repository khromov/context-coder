import { DirectoryTreeArgsSchema } from '../schemas.js';
import type { HandlerContext, HandlerResponse, ToolInput } from '../types.js';
import { validateRelativePath, resolveRelativePath } from './utils.js';
import { buildTree } from '../file-operations.js';
import logger from '../logger.js';

export async function handleDirectoryTree(
  args: ToolInput,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('🌳 directory_tree handler started');

  const parsed = DirectoryTreeArgsSchema.safeParse(args || {});
  if (!parsed.success) {
    throw new Error(`Invalid arguments for directory_tree: ${parsed.error}`);
  }
  validateRelativePath(parsed.data.path);
  const absolutePath = resolveRelativePath(parsed.data.path, context.absoluteRootDir);

  const treeData = await buildTree(
    absolutePath,
    [context.absoluteRootDir],
    context.absoluteRootDir
  );

  const result: HandlerResponse = {
    content: [
      {
        type: 'text',
        text: JSON.stringify(treeData, null, 2),
      },
    ],
  };

  logger.debug(
    `⏱️ directory_tree handler finished for path: ${parsed.data.path}, found ${treeData.length} entries`
  );
  return result;
}
