import { McpServer } from 'tmcp';
import { ZodV3JsonSchemaAdapter } from '@tmcp/adapter-zod-v3';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getToolsForTmcp } from './tools.js';
import type { HandlerContext, McpCallToolResult, ToolInput } from './types.js';
import logger from './logger.js';
import { prompts, getPromptContent } from './lib/prompts.js';
import { getVersion } from './lib/version.js';

/**
 * Process instructions.md content based on edit mode
 * Replaces template placeholders with appropriate content
 */
function processInstructionsForEditMode(instructions: string, editModeEnabled: boolean): string {
  let processed = instructions;

  if (editModeEnabled) {
    // Replace placeholders with edit_file enabled content
    processed = processed.replace(
      '{EDIT_FILE_TOOL_LIST}',
      '- `edit_file` - Make line-based partial edits to files'
    );
    processed = processed.replace(
      '{EDITING_STRATEGY}',
      '**Editing Strategy**: Use `edit_file` for small, targeted changes and `write_file` when rewriting entire files or making extensive changes.'
    );
    processed = processed.replace(
      '{EFFICIENT_EDITING_PRACTICE}',
      '**Efficient Editing**: Use `edit_file` for small changes, `write_file` for larger edits'
    );
  } else {
    // Replace placeholders with edit_file disabled content
    processed = processed.replace('{EDIT_FILE_TOOL_LIST}', '');
    processed = processed.replace(
      '{EDITING_STRATEGY}',
      '**Editing Strategy**: Use `write_file` to create or completely overwrite files with new content.'
    );
    processed = processed.replace(
      '{EFFICIENT_EDITING_PRACTICE}',
      '**Efficient Editing**: Use `write_file` for complete file rewrites'
    );
  }

  return processed;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to read instructions file, but don't fail if it doesn't exist
let instructions = '';
try {
  instructions = readFileSync(join(__dirname, 'instructions.md'), 'utf-8');

  // Process instructions based on edit mode
  const editModeEnabled = process.env.CONTEXT_CODER_EDIT_MODE === 'true';
  instructions = processInstructionsForEditMode(instructions, editModeEnabled);
} catch {
  logger.warn('Warning: instructions.md not found, continuing without instructions');
}

export const createServer = async () => {
  // Determine the root directory based on environment
  const ROOT_DIR = process.env.COCO_DEV === 'true' ? './mount' : './';

  // Resolve to absolute path for internal use only
  const absoluteRootDir = path.resolve(ROOT_DIR);

  // Create Zod adapter
  const adapter = new ZodV3JsonSchemaAdapter();

  // Create MCP server with proper typing
  const server = new McpServer(
    {
      name: 'context-coder',
      version: getVersion(),
      description: instructions || 'Context Coder: MCP server for full-context coding',
    },
    {
      adapter,
      capabilities: {
        tools: { listChanged: true },
        prompts: { listChanged: true },
        resources: { listChanged: false },
      },
    }
  );

  // Get tools based on current mode and register them
  const tools = getToolsForTmcp();

  // Create handler context
  const context: HandlerContext = {
    absoluteRootDir,
  };

  // Register tools with proper typing
  for (const tool of tools) {
    const handler = async (input: ToolInput): Promise<McpCallToolResult> => {
      try {
        const result = await tool.handler(input, context);

        // Handlers now return the correct format directly
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Return error as CallToolResult
        return {
          content: [{ type: 'text' as const, text: `Error: ${errorMessage}` }],
          isError: true,
        };
      }
    };

    // Register tool with tmcp server using proper typing
    server.tool(
      {
        name: tool.name,
        description: tool.description,
        schema: tool.schema,
      },
      handler
    );
  }

  // Register prompts
  for (const prompt of prompts) {
    server.prompt(
      {
        name: prompt.name,
        description: prompt.description || '',
      },
      async () => {
        try {
          // For now, prompts don't take input arguments in tmcp
          // We'll use an empty object as input
          const messages = getPromptContent(prompt.name, {});

          // Convert messages to tmcp format with proper content structure
          return {
            messages: messages.map((msg) => ({
              role: msg.role as 'user' | 'assistant',
              content: {
                type: 'text' as const,
                text: msg.content.text,
              },
            })),
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(errorMessage);
        }
      }
    );
  }

  const cleanup = async () => {
    // Add any cleanup logic here if needed
  };

  return { server, cleanup };
};
