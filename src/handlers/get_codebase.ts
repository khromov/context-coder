import { GetCodebaseArgsSchema } from '../schemas.js';
import { HandlerContext, HandlerResponse } from '../types.js';
import {
  validateRelativePath,
  resolveRelativePath,
  getIgnoreFile,
  getMinifyFile,
} from './utils.js';
import { generateCodebaseDigest } from '../codebase-digest.js';
import logger from '../logger.js';

export async function handleGetCodebase(
  args: any,
  context: HandlerContext
): Promise<HandlerResponse> {
  const parsed = GetCodebaseArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for get_codebase: ${parsed.error}`);
  }

  logger.info(
    `📦 get_codebase handler started: page ${parsed.data.page}, path ${parsed.data.path}`
  );

  validateRelativePath(parsed.data.path);
  const absolutePath = resolveRelativePath(parsed.data.path, context.absoluteRootDir);

  try {
    // Check for .cocoignore file and log which one will be used
    const ignoreFile = await getIgnoreFile(absolutePath);
    if (ignoreFile) {
      logger.info(`📋 get_codebase using ignore file: ${ignoreFile}`);
    }

    // Check for .cocominify file and log which one will be used
    const minifyFile = await getMinifyFile(absolutePath);
    if (minifyFile) {
      logger.info(`📋 get_codebase using minify file: ${minifyFile}`);
    }

    logger.debug(`Generating codebase digest for path: ${absolutePath}`);

    // Use _pageSize if provided, otherwise default to 99000
    const pageSize = parsed.data._pageSize ?? 99000; // Claude Desktop limits to 100,000 characters per page, so we leave some buffer

    const result = await generateCodebaseDigest({
      inputDir: absolutePath,
      page: parsed.data.page,
      pageSize,
    });
    logger.debug(`Generated codebase digest with length: ${result.content.length}`);

    // The message is already in the correct format from codebase-digest.ts
    const content = result.content;

    const handlerResult = {
      content: [{ type: 'text', text: content }],
    };

    logger.info(
      `⏱️ get_codebase handler finished: page ${parsed.data.page}, content length ${result.content.length}, has more pages: ${result.hasMorePages}`
    );
    return handlerResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`⏱️ get_codebase handler finished with error: ${errorMessage}`);
    throw new Error(`Failed to generate codebase digest: ${errorMessage}`);
  }
}
