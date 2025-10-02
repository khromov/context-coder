import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  GetCodebaseSizeArgsSchema,
  GetCodebaseArgsSchema,
  GetCodebaseTopLargestFilesArgsSchema,
  ReadFileArgsSchema,
  WriteFileArgsSchema,
  RemoveFileArgsSchema,
  EditFileArgsSchema,
  CreateDirectoryArgsSchema,
  ListDirectoryArgsSchema,
  DirectoryTreeArgsSchema,
  MoveFileArgsSchema,
  SearchFilesArgsSchema,
  SearchFileContentArgsSchema,
  ExecuteCommandArgsSchema,
} from './schemas.js';
import { ToolInput, ToolHandler } from './types.js';

// Import handlers
import { handleGetCodebaseSize } from './handlers/get_codebase_size.js';
import { handleGetCodebase } from './handlers/get_codebase.js';
import { handleGetCodebaseTopLargestFiles } from './handlers/get_codebase_top_largest_files.js';
import { handleReadFile } from './handlers/read_file.js';
import { handleWriteFile } from './handlers/write_file.js';
import { handleRemoveFile } from './handlers/remove_file.js';
import { handleEditFile } from './handlers/edit_file.js';
import { handleCreateDirectory } from './handlers/create_directory.js';
import { handleListDirectory } from './handlers/list_directory.js';
import { handleDirectoryTree } from './handlers/directory_tree.js';
import { handleMoveFile } from './handlers/move_file.js';
import { handleSearchFiles } from './handlers/search_files.js';
import { handleSearchFileContent } from './handlers/search_file_content.js';
import { handleExecuteCommand } from './handlers/execute_command.js';

// Extend Tool type to include handler
export interface ToolWithHandler extends Tool {
  handler: ToolHandler;
}

// Define the core mini tools that are always included
const miniTools: ToolWithHandler[] = [
  {
    name: 'get_codebase_size',
    description:
      'Check the codebase size and token counts before processing. ' +
      'Returns token counts for Claude and ChatGPT, warns if the codebase is too large, ' +
      'and shows the largest files. ' +
      'IMPORTANT: You should ALWAYS run this tool at the start of EVERY NEW CONVERSATION before any other operations. ' +
      'After running this tool, you should then call get_codebase to retrieve the actual code.',
    inputSchema: zodToJsonSchema(GetCodebaseSizeArgsSchema) as ToolInput,
    handler: handleGetCodebaseSize,
  },
  {
    name: 'get_codebase',
    description:
      'Generate a a merged markdown file of the entire codebase.' +
      'Results are paginated.' +
      'If more content exists, a message will prompt to call again with the next page number. Leave the _pageSize variable empty UNLESS you are running under Claude Code, in that case set it to 30000 to work around the Claude Code limits.',
    inputSchema: zodToJsonSchema(GetCodebaseArgsSchema) as ToolInput,
    handler: handleGetCodebase,
  },
  {
    name: 'get_codebase_top_largest_files',
    description:
      'Returns the top X largest files in the codebase. ' +
      'Use this tool when users want to see more large files beyond the initial 10 shown in get_codebase_size. ' +
      'Helpful for identifying which files to add to .cocoignore for large codebases.',
    inputSchema: zodToJsonSchema(GetCodebaseTopLargestFilesArgsSchema) as ToolInput,
    handler: handleGetCodebaseTopLargestFiles,
  },
];

// Define additional tools for the full version
const additionalTools = [
  {
    name: 'read_file',
    description:
      'Read the complete contents of a file from the file system. ' +
      "Use relative paths with or without './' prefix (e.g., 'file.txt', './file.txt', 'folder/file.txt'). " +
      'IMPORTANT: You should NEVER call this unless the user specifically asks to re-read a file OR you get stuck and need it to debug something.',
    inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
    handler: handleReadFile,
  },
  process.env.CONTEXT_CODER_EDIT_MODE === 'true'
    ? {
        name: 'edit_file',
        description:
          'Make line-based edits to a text file. Each edit replaces exact line sequences ' +
          "with new content. Use relative paths with or without './' prefix (e.g., 'file.txt', './folder/file.txt'). " +
          'By default, throws an error if text appears multiple times. Set replace_all to true to replace all occurrences. ' +
          'Use this tool only if you have a small, focused set of edits that need to be made. If you are making larger changes or are unsure, use the write_file tool instead.',
        inputSchema: zodToJsonSchema(EditFileArgsSchema) as ToolInput,
        handler: handleEditFile,
      }
    : undefined,
  {
    name: 'write_file',
    description:
      'Create a new file or completely overwrite an existing file with new content. ' +
      "Use relative paths with or without './' prefix (e.g., 'newfile.txt', './folder/file.txt'). " +
      'You must write out the file in full each time you call write_file.',
    inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
    handler: handleWriteFile,
  },
  {
    name: 'remove_file',
    description:
      'Delete a file from the file system. ' +
      "Use relative paths with or without './' prefix (e.g., 'file.txt', './folder/file.txt'). " +
      'This operation is irreversible. Only works with files, not directories.',
    inputSchema: zodToJsonSchema(RemoveFileArgsSchema) as ToolInput,
    handler: handleRemoveFile,
  },
  {
    name: 'create_directory',
    description:
      'Create a new directory or ensure a directory exists. ' +
      "Use relative paths with or without './' prefix (e.g., 'newfolder', './parent/child'). " +
      'Can create multiple nested directories in one operation.',
    inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) as ToolInput,
    handler: handleCreateDirectory,
  },
  {
    name: 'list_directory',
    description:
      'Get a detailed listing of all files and directories in a specified path. ' +
      "Use relative paths with or without './' prefix (use './' or '.' for root directory). " +
      'Results show [FILE] and [DIR] prefixes to distinguish between files and directories. ' +
      'IMPORTANT: You should NEVER call this unless the user specifically asks to find all the files in a directory or use this tool OR you get stuck and need it to debug something.',
    inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
    handler: handleListDirectory,
  },
  {
    name: 'directory_tree',
    description:
      'Get a recursive tree view of files and directories as a JSON structure. ' +
      'Path is optional - if not provided, shows the root directory. ' +
      'Returns a structured view of the entire directory hierarchy. ' +
      'IMPORTANT: You should NEVER call this UNLESS the user specifically asks for it OR you get stuck and need it to debug something.',
    inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) as ToolInput,
    handler: handleDirectoryTree,
  },
  {
    name: 'move_file',
    description:
      'Move or rename files and directories. ' +
      "Use relative paths with or without './' prefix for both source and destination. " +
      'Can move files between directories and rename them in a single operation.',
    inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
    handler: handleMoveFile,
  },
  {
    name: 'search_files',
    description:
      'Recursively search for files by file name matching a pattern. ' +
      "Use relative paths with or without './' prefix for the search root. " +
      'The search is case-insensitive and matches partial file names. ' +
      'Do NOT call this tool unless the user specifically asks to search for files or you get stuck and need it to debug something.' +
      'Remember that you generally already have access to all the codebase, so there is little reason to search for files.',
    inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
    handler: handleSearchFiles,
  },
  {
    name: 'search_file_content',
    description:
      'Search for text patterns within file contents across the codebase. ' +
      "Use relative paths with or without './' prefix for the search root. " +
      'Supports both literal text search and regular expressions. ' +
      'Returns matching files with line numbers and context around matches. ' +
      'By default, respects .cocoignore patterns - set includeAllFiles to true to search all files. ' +
      'IMPORTANT: Only use this tool when the user specifically asks to search for content OR when you are totally stuck and need to find something. ' +
      'If no results are found with includeAllFiles=false, try again with includeAllFiles=true.',
    inputSchema: zodToJsonSchema(SearchFileContentArgsSchema) as ToolInput,
    handler: handleSearchFileContent,
  },
  {
    name: 'execute_command',
    description:
      'Execute a shell command with controlled environment. ' +
      "Pass the full command as a string (e.g., 'npx -y ai-digest', 'ls -la'). " +
      'Commands are executed with a 60-second timeout to prevent hanging. ' +
      'Returns stdout, stderr, and exit code. ' +
      'Available CLI tools include: fzf (fuzzy finder), gh (GitHub CLI), jq (JSON processor), ' +
      'dig/nslookup (DNS tools), iptables/ipset (network tools), claude-code (Claude CLI).',
    inputSchema: zodToJsonSchema(ExecuteCommandArgsSchema) as ToolInput,
    handler: handleExecuteCommand,
  },
].filter((tool): tool is NonNullable<typeof tool> => tool !== undefined);

// Function to get tools based on runtime mode
export function getTools(mode?: 'mini' | 'full'): ToolWithHandler[] {
  // Determine mode from sources (in order of priority):
  // 1. Explicit mode parameter
  // 2. Runtime environment variable set by index.ts based on command line flags
  // 3. Default to full (for npx usage)
  const resolvedMode: 'mini' | 'full' =
    mode || (process.env.CONTEXT_CODER_MODE as 'mini' | 'full') || 'full';

  return resolvedMode === 'mini' ? miniTools : [...miniTools, ...additionalTools];
}

// Export default tools for backward compatibility (defaults to full)
export const tools: ToolWithHandler[] = getTools();
