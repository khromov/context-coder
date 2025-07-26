import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getTools, ToolWithHandler } from './tools.js';
import { HandlerContext } from './types.js';
import logger from './logger.js';
import { prompts, getPromptContent } from './lib/prompts.js';
import { getVersion } from './lib/version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const createServer = async () => {
  // Try to read instructions file, but don't fail if it doesn't exist
  let instructions = '';
  try {
    instructions = await fs.readFile(join(__dirname, 'instructions.md'), 'utf-8');
  } catch (error) {
    logger.warn('Warning: instructions.md not found, continuing without instructions');
  }
  // Determine the root directory based on environment
  const ROOT_DIR = process.env.COCO_DEV === 'true' ? './mount' : './';

  // Resolve to absolute path for internal use only
  const absoluteRootDir = path.resolve(ROOT_DIR);

  // Get tools based on current mode
  const tools = getTools();

  const server = new Server(
    {
      name: 'context-coder',
      version: await getVersion(),
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
    const toolsWithoutHandlers: Tool[] = tools.map(({ handler, ...tool }) => tool);
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
