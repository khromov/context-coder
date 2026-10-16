import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// Tree entry interface for directory tree
export interface TreeEntry {
  name: string;
  type: 'file' | 'directory';
  children?: TreeEntry[];
}

// MCP tool types
export type ToolInput = Tool['inputSchema'];

// Handler types
export interface HandlerContext {
  absoluteRootDir: string;
}

export interface HandlerResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
  [key: string]: unknown; // Allow additional properties
}

// Handlers validate their arguments with their Zod schema, so they accept anything
export type ToolHandler = (args: unknown, context: HandlerContext) => Promise<HandlerResponse>;
