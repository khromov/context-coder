import { GetCodebaseSizeArgsSchema } from '../schemas.js';
import { HandlerContext, HandlerResponse } from '../types.js';
import {
  validateRelativePath,
  resolveRelativePath,
  getIgnoreFile,
  getMinifyFile,
  normalizeDisplayPath,
} from './utils.js';
import aiDigest from 'ai-digest';
import logger from '../logger.js';

export async function handleGetCodebaseSize(
  args: any,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('📊 get_codebase_size handler started');

  const parsed = GetCodebaseSizeArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for get_codebase_size: ${parsed.error}`);
  }

  validateRelativePath(parsed.data.path);
  const absolutePath = resolveRelativePath(parsed.data.path, context.absoluteRootDir);

  try {
    logger.debug(`Getting file statistics for path: ${absolutePath}`);

    // Check for .cocoignore file
    const ignoreFile = await getIgnoreFile(absolutePath);
    logger.info(
      `📋 get_codebase_size using ignore file: ${ignoreFile || '.aidigestignore (default)'}`
    );

    // Check for .cocominify file
    const minifyFile = await getMinifyFile(absolutePath);
    logger.info(
      `📋 get_codebase_size using minify file: ${minifyFile || '.aidigestminify (default)'}`
    );

    // Get file statistics without content
    const stats = await aiDigest.getFileStats({
      inputDir: absolutePath,
      ignoreFile,
      minifyFile,
      silent: true,
      additionalDefaultIgnores: ['.cocoignore', '.cocominify'],
    });

    // Sort files by size (largest first) - they should already be sorted by ai-digest
    const sortedFiles = stats.files || [];

    let output = '';

    // Get token limits from environment variables or use defaults
    const parsedClaudeLimit = parseInt(process.env.COCO_CLAUDE_TOKEN_LIMIT || '150000', 10);
    const claudeTokenLimit = isNaN(parsedClaudeLimit) ? 150000 : parsedClaudeLimit;

    const parsedGptLimit = parseInt(process.env.COCO_GPT_TOKEN_LIMIT || '128000', 10);
    const gptTokenLimit = isNaN(parsedGptLimit) ? 128000 : parsedGptLimit;
    // Log the token limits being used for debugging
    logger.debug(`Using token limits - Claude: ${claudeTokenLimit}, GPT: ${gptTokenLimit}`);

    const hitClaudeLimit = stats.totalClaudeTokens > claudeTokenLimit;

    // Show token summary
    output += `## Token Summary\n\n`;
    output += `- **Claude tokens**: ${stats.totalClaudeTokens.toLocaleString()}\n`;
    output += `- **ChatGPT tokens**: ${stats.totalGptTokens.toLocaleString()}\n`;
    output += `- **Total files**: ${sortedFiles.length}\n\n`;

    // Only show top largest files if we hit the Claude limit
    if (hitClaudeLimit && sortedFiles.length > 0) {
      output += `## Top 25 Largest Files\n\n`;
      output += `Tell the user to consider adding some of these to their \`.cocoignore\` file if they are big and not relevant to the project (test files, snapshots, external modules, test data, other unused files, etc):\n\n`;

      const top25Files = sortedFiles.slice(0, 25);
      top25Files.forEach((file, index) => {
        const sizeInKB = (file.sizeInBytes / 1024).toFixed(2);
        const displayPath = normalizeDisplayPath(file.path, absolutePath);
        output += `${index + 1}. \`${displayPath}\` - ${sizeInKB} KB\n`;
      });

      if (sortedFiles.length > 25) {
        output += `\n... and ${sortedFiles.length - 25} more files.\n`;
        output += `\n💡 **Tip**: You can use the \`get_codebase_top_largest_files\` tool to see more large files. For example, to see the top 50 largest files, just ask me "show me the top 50 largest files in the codebase".\n`;
      }
    }

    if (hitClaudeLimit) {
      output += `⚠️ **WARNING: Large Codebase Detected**\n\n`;
      output += `Tell the user that the codebase contains ${stats.totalClaudeTokens.toLocaleString()} Claude tokens, which exceeds the current limit of ${claudeTokenLimit.toLocaleString()} tokens.\n\n`;
      output += `Tell the user that the codebase is likely too large for your context window, and that they should create a \`.cocoignore\` file in the root of your project (similar to .gitignore) to exclude unnecessary files.\n\n`;
      output += `**Ask the user if they want to proceed anyway?** If yes, run \`get_codebase\` - but make the user aware that the large size may cause issues.\n\n`;
    }

    // Add instruction to run get_codebase next
    output += `\n## Next Step\n\n`;
    if (hitClaudeLimit) {
      output += `If you want to proceed despite the large codebase size, run the \`get_codebase\` tool to retrieve the actual codebase content. Tell the user to consider using a \`.cocoignore\` file to reduce the size first.`;
    } else {
      output += `You MUST now run the \`get_codebase\` tool to retrieve the actual codebase content - this is required for this MCP to function correctly.`;
    }

    const handlerResult = {
      content: [{ type: 'text', text: output }],
    };

    logger.info(
      `⏱️ get_codebase_size handler finished: ${sortedFiles.length} files, ${stats.totalClaudeTokens} tokens`
    );
    return handlerResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`⏱️ get_codebase_size handler finished with error: ${errorMessage}`);
    throw new Error(`Failed to get codebase statistics: ${errorMessage}`);
  }
}
