import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getTools } from './tools.js';
import { HandlerContext } from './types.js';
import logger from './logger.js';
import { prompts, getPromptContent } from './lib/prompts.js';
import { getVersion } from './lib/version.js';
import { processInstructions } from './lib/instructions.js';
import { getMode, isEditMode } from './constants.js';
import { getRootDir } from './handlers/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to read instructions file, but don't fail if it doesn't exist.
// It is filled in for the mode (mini/full) and whether edit_file is enabled.
let instructions = '';
try {
  const template = readFileSync(join(__dirname, 'instructions.md'), 'utf-8');
  instructions = processInstructions(template, { mode: getMode(), editMode: isEditMode() });
} catch {
  logger.warn('Warning: instructions.md not found, continuing without instructions');
}

export const createServer = async () => {
  // ./mount in development (COCO_DEV=true), otherwise the working directory
  const absoluteRootDir = getRootDir();

  // Get tools based on current mode
  const tools = getTools();

  const server = new Server(
    {
      name: 'context-coder',
      version: getVersion(),
    },
    {
      capabilities: {
        prompts: {},
        tools: {},
      },
      instructions,
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Convert ToolWithHandler[] to Tool[] for the response
    const toolsWithoutHandlers: Tool[] = tools.map(({ handler: _handler, ...tool }) => tool);
    return { tools: toolsWithoutHandlers };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Find the tool by name
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Error: Unknown tool: ${name}` }],
        isError: true,
      };
    }

    // Create handler context
    const context: HandlerContext = {
      absoluteRootDir,
    };

    // Execute the handler
    try {
      return await tool.handler(args, context);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // Add prompt handlers
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const prompt = prompts.find((p) => p.name === name);

    if (!prompt) {
      throw new Error(`Unknown prompt: ${name}`);
    }

    const promptMessages = getPromptContent(name, args);

    return {
      description: prompt.description,
      messages: promptMessages,
    };
  });

  const cleanup = async () => {
    // Add any cleanup logic here if needed
  };

  return { server, cleanup };
};
