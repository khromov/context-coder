import { SearchFilesArgsSchema } from '../schemas.js';
import { HandlerContext, HandlerResponse } from '../types.js';
import { resolveSafePath } from './utils.js';
import { searchFiles } from '../file-operations.js';
import fs from 'fs/promises';
import path from 'path';
import logger from '../logger.js';

export async function handleSearchFiles(
  args: unknown,
  context: HandlerContext
): Promise<HandlerResponse> {
  const parsed = SearchFilesArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
  }

  logger.info(
    `🔍 search_files handler started: pattern "${parsed.data.pattern}", path ${parsed.data.path}`
  );

  const absolutePath = await resolveSafePath(parsed.data.path, context.absoluteRootDir);
  const results = await searchFiles(absolutePath, parsed.data.pattern, parsed.data.excludePatterns);

  // Results are under the symlink-free search path, so make them relative to the
  // symlink-free root. Always use forward slashes so results look the same on Windows.
  const realRoot = await fs.realpath(context.absoluteRootDir);
  const relativePaths = results.map((absPath) => {
    const relPath = path.relative(realRoot, absPath);
    return relPath.split(path.sep).join('/');
  });

  const result = {
    content: [
      {
        type: 'text',
        text: relativePaths.length > 0 ? relativePaths.join('\n') : 'No matches found',
      },
    ],
  };

  logger.info(
    `⏱️ search_files handler finished: found ${relativePaths.length} matches for pattern "${parsed.data.pattern}"`
  );
  return result;
}
