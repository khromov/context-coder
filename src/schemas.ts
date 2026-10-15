import { z } from 'zod';

// File system schema definitions
export const ReadFileArgsSchema = z.object({
  path: z
    .string()
    .describe(
      'Relative path from root directory (e.g., "file.txt", "folder/file.txt", "./file.txt")'
    ),
});

export const WriteFileArgsSchema = z.object({
  path: z.string().describe('Relative path from root directory (with or without "./" prefix)'),
  content: z.string(),
});

export const RemoveFileArgsSchema = z.object({
  path: z.string().describe('Relative path from root directory (with or without "./" prefix)'),
});

export const CreateDirectoryArgsSchema = z.object({
  path: z.string().describe('Relative path from root directory (with or without "./" prefix)'),
});

export const ListDirectoryArgsSchema = z.object({
  path: z.string().describe('Relative path from root directory (use "./" or "." for root)'),
});

export const DirectoryTreeArgsSchema = z.object({
  path: z
    .string()
    .optional()
    .default('')
    .transform((p) => p || '')
    .describe('Relative path from root directory, with or without "./" prefix (defaults to root)'),
});

export const MoveFileArgsSchema = z.object({
  source: z.string().describe('Relative path from root directory'),
  destination: z.string().describe('Relative path from root directory'),
});

export const SearchFilesArgsSchema = z.object({
  path: z.string().describe('Relative path from root directory (with or without "./" prefix)'),
  pattern: z.string(),
  excludePatterns: z.array(z.string()).optional().default([]),
});

export const ExecuteCommandArgsSchema = z.object({
  command: z
    .string()
    .describe(
      'The full command line to execute, run through a shell (/bin/sh on POSIX, cmd.exe on Windows). ' +
        'Quoting, pipes, &&, redirects, globs and $VAR expansion are supported ' +
        '(e.g., "npx -y ai-digest", "ls -la", \'grep -n "import" src/index.ts | head -5\')'
    ),
  timeout: z
    .number()
    .optional()
    .default(60000)
    .describe('Command timeout in milliseconds (default: 60 seconds)'),
  env: z
    .record(z.string(), z.string())
    .optional()
    .describe('Environment variables to set for the command'),
});

export const GetCodebaseArgsSchema = z.object({
  path: z
    .string()
    .optional()
    .default('')
    .describe('Relative path from root directory to analyze (defaults to root)'),
  page: z.number().optional().default(1).describe('Page number for pagination (defaults to 1)'),
  _pageSize: z
    .number()
    .optional()
    .describe('Page size for pagination. Leave empty to use the server default.'),
});

export const GetCodebaseSizeArgsSchema = z.object({
  path: z
    .string()
    .optional()
    .default('')
    .describe('Relative path from root directory to analyze (defaults to root)'),
});

export const GetCodebaseTopLargestFilesArgsSchema = z.object({
  path: z
    .string()
    .optional()
    .default('')
    .describe('Relative path from root directory to analyze (defaults to root)'),
  count: z
    .number()
    .optional()
    .default(20)
    .describe('Number of largest files to return (defaults to 20)'),
});

export const EditOperation = z.object({
  oldText: z.string().describe('Text to search for - must match exactly'),
  newText: z.string().describe('Text to replace with'),
});

export const EditFileArgsSchema = z.object({
  path: z.string().describe('Relative path from root directory (with or without "./" prefix)'),
  edits: z.array(EditOperation),
  dryRun: z.boolean().default(false).describe('Preview changes using git-style diff format'),
  replaceAll: z
    .boolean()
    .default(false)
    .describe(
      'Allow replacing all occurrences of text. If false and multiple matches found, returns an error.'
    ),
});
