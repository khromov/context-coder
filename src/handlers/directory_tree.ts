import { DirectoryTreeArgsSchema } from '../schemas.js';
import { HandlerContext, HandlerResponse } from '../types.js';
import { resolveSafePath } from './utils.js';
import { buildTree } from '../file-operations.js';
import logger from '../logger.js';

export async function handleDirectoryTree(
  args: unknown,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('🌳 directory_tree handler started');

  const parsed = DirectoryTreeArgsSchema.safeParse(args ?? {});
  if (!parsed.success) {
    throw new Error(`Invalid arguments for directory_tree: ${parsed.error}`);
  }
  const absolutePath = await resolveSafePath(parsed.data.path, context.absoluteRootDir);

  const treeData = await buildTree(absolutePath);

  const result = {
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
