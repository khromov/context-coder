import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
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
  ExecuteCommandArgsSchema,
} from './schemas.js';
import { ToolInput, ToolHandler } from './types.js';
import {
  COMMAND_OUTPUT_HEAD_BYTES,
  COMMAND_OUTPUT_TAIL_BYTES,
  getClaudeCodePageSize,
  getMode,
  isEditMode,
  ServerMode,
} from './constants.js';
import { resolveShell } from './lib/shell.js';

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
import { handleExecuteCommand } from './handlers/execute_command.js';

// Describe the arguments a client may send, so fields with defaults stay optional
function toInputSchema(schema: z.ZodType): ToolInput {
  return z.toJSONSchema(schema, { io: 'input', target: 'draft-7' }) as ToolInput;
}

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
      'Returns token counts for Claude and ChatGPT, and when the codebase is over the token limit, ' +
      'warns about it and lists the largest files. ' +
      'IMPORTANT: You should ALWAYS run this tool at the start of EVERY NEW CONVERSATION before any other operations. ' +
      'After running this tool, you should then call get_codebase to retrieve the actual code.',
    inputSchema: toInputSchema(GetCodebaseSizeArgsSchema),
    handler: handleGetCodebaseSize,
  },
  {
    name: 'get_codebase',
    description:
      'Generate a merged markdown file of the entire codebase. ' +
      'Results are paginated: if more content exists, the result tells you to call again with the next page number. ' +
      `Leave the _pageSize variable empty UNLESS you are running under Claude Code, in that case set it to ${getClaudeCodePageSize()} to work around the Claude Code limits.`,
    inputSchema: toInputSchema(GetCodebaseArgsSchema),
    handler: handleGetCodebase,
  },
  {
    name: 'get_codebase_top_largest_files',
    description:
      'Returns the top X largest files in the codebase. ' +
      'Use this tool when users want to see which files take up the most space, ' +
      'for example to decide what to add to .cocoignore or .cocominify for large codebases.',
    inputSchema: toInputSchema(GetCodebaseTopLargestFilesArgsSchema),
    handler: handleGetCodebaseTopLargestFiles,
  },
];

const commandOutputLimitKb = Math.round(
  Math.min(COMMAND_OUTPUT_HEAD_BYTES, COMMAND_OUTPUT_TAIL_BYTES) / 1000
);

// Only offered with --edit / --edit-file-mode
const editFileTool: ToolWithHandler = {
  name: 'edit_file',
  description:
    'Make exact text replacements in a file. Each edit replaces oldText with newText, and edits are applied in order. ' +
    "Use relative paths with or without './' prefix (e.g., 'file.txt', './folder/file.txt'). " +
    'If an oldText appears more than once, the call fails unless replaceAll is true, which replaces every occurrence. ' +
    'Line endings in oldText and newText are matched to the file (LF or CRLF). ' +
    'Use this tool only if you have a small, focused set of edits that need to be made. If you are making larger changes or are unsure, use the write_file tool instead.',
  inputSchema: toInputSchema(EditFileArgsSchema),
  handler: handleEditFile,
};

// Define additional tools for the full version
const additionalTools: ToolWithHandler[] = [
  {
    name: 'read_file',
    description:
      'Read the complete contents of a file from the file system. ' +
      "Use relative paths with or without './' prefix (e.g., 'file.txt', './file.txt', 'folder/file.txt'). " +
      'IMPORTANT: You should NEVER call this unless the user specifically asks to re-read a file OR you get stuck and need it to debug something.',
    inputSchema: toInputSchema(ReadFileArgsSchema),
    handler: handleReadFile,
  },
  ...(isEditMode() ? [editFileTool] : []),
  {
    name: 'write_file',
    description:
      'Create a new file or completely overwrite an existing file with new content. ' +
      "Use relative paths with or without './' prefix (e.g., 'newfile.txt', './folder/file.txt'). " +
      'You must write out the file in full each time you call write_file.',
    inputSchema: toInputSchema(WriteFileArgsSchema),
    handler: handleWriteFile,
  },
  {
    name: 'remove_file',
    description:
      'Delete a file from the file system. ' +
      "Use relative paths with or without './' prefix (e.g., 'file.txt', './folder/file.txt'). " +
      'This operation is irreversible. Only works with files, not directories.',
    inputSchema: toInputSchema(RemoveFileArgsSchema),
    handler: handleRemoveFile,
  },
  {
    name: 'create_directory',
    description:
      'Create a new directory or ensure a directory exists. ' +
      "Use relative paths with or without './' prefix (e.g., 'newfolder', './parent/child'). " +
      'Can create multiple nested directories in one operation.',
    inputSchema: toInputSchema(CreateDirectoryArgsSchema),
    handler: handleCreateDirectory,
  },
  {
    name: 'list_directory',
    description:
      'Get a detailed listing of all files and directories in a specified path. ' +
      "Use relative paths with or without './' prefix (use './' or '.' for root directory). " +
      'Results show [FILE] and [DIR] prefixes to distinguish between files and directories. ' +
      'IMPORTANT: You should NEVER call this unless the user specifically asks to find all the files in a directory or use this tool OR you get stuck and need it to debug something.',
    inputSchema: toInputSchema(ListDirectoryArgsSchema),
    handler: handleListDirectory,
  },
  {
    name: 'directory_tree',
    description:
      'Get a recursive tree view of files and directories as a JSON structure. ' +
      'Path is optional - if not provided, shows the root directory. ' +
      'Returns a structured view of the entire directory hierarchy. ' +
      'IMPORTANT: You should NEVER call this UNLESS the user specifically asks for it OR you get stuck and need it to debug something.',
    inputSchema: toInputSchema(DirectoryTreeArgsSchema),
    handler: handleDirectoryTree,
  },
  {
    name: 'move_file',
    description:
      'Move or rename files and directories. ' +
      "Use relative paths with or without './' prefix for both source and destination. " +
      'Can move files between directories and rename them in a single operation.',
    inputSchema: toInputSchema(MoveFileArgsSchema),
    handler: handleMoveFile,
  },
  {
    name: 'search_files',
    description:
      'Recursively search for files by file name matching a pattern. ' +
      "Use relative paths with or without './' prefix for the search root. " +
      'The search is case-insensitive and matches partial file names. ' +
      'It does not descend into dependency, version control and cache folders such as node_modules and .git, unless the search starts inside one. ' +
      'Do NOT call this tool unless the user specifically asks to search for files or you get stuck and need it to debug something. ' +
      'Remember that you generally already have access to all the codebase, so there is little reason to search for files.',
    inputSchema: toInputSchema(SearchFilesArgsSchema),
    handler: handleSearchFiles,
  },
  {
    name: 'execute_command',
    description:
      'Execute a shell command with controlled environment. ' +
      "Pass the full command line as a string (e.g., 'npx -y ai-digest', 'ls -la'). " +
      `The command runs through ${resolveShell().label}, so quoting, ` +
      'pipes, &&, redirects, globs and environment variable expansion work as usual. ' +
      'Quote shell metacharacters (& | ( ) ; # $ *) when you mean them literally, e.g. a URL containing &. ' +
      'Note that a non-zero exit code is not always a failure: grep, for example, exits with 1 when nothing matches. ' +
      'Commands are executed with a 60-second timeout (configurable) to prevent hanging; on timeout the command and any processes it started are killed and the result says it timed out. ' +
      'The call returns only once all output streams close, so background jobs must redirect their output (cmd >/dev/null 2>&1 &), otherwise the call blocks until the timeout. ' +
      'Commands get no stdin, so anything that waits for input sees end-of-file instead. ' +
      `Very long output keeps only the first and last ${commandOutputLimitKb} KB of stdout and of stderr. ` +
      'Returns stdout, stderr, and exit code. ' +
      'Which CLI tools are available depends on the machine; the Docker image includes git, gh (GitHub CLI), jq and dig/nslookup.',
    inputSchema: toInputSchema(ExecuteCommandArgsSchema),
    handler: handleExecuteCommand,
  },
];

/**
 * Tools for a mode: the mini tools always, plus the file and command tools in full mode.
 * Defaults to the mode set from the command line flags (full unless --mini).
 */
export function getTools(mode: ServerMode = getMode()): ToolWithHandler[] {
  return mode === 'mini' ? miniTools : [...miniTools, ...additionalTools];
}
