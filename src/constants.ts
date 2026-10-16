// Default page size (in characters) for get_codebase pagination.
// Claude Desktop limits to 100,000 characters per page, so we leave some buffer.
export const DEFAULT_PAGE_SIZE = 99000;

// Page size (in characters) suggested to the model when it runs under Claude
// Code, which has a smaller per-page limit than the default. This value is
// surfaced in the get_codebase tool description.
export const DEFAULT_CLAUDE_CODE_PAGE_SIZE = 30000;

// get_codebase_size warns when the codebase has more tokens than these limits
export const DEFAULT_CLAUDE_TOKEN_LIMIT = 150000;
export const DEFAULT_GPT_TOKEN_LIMIT = 128000;

// HTTP mode only listens on this computer unless --host / COCO_HOST says otherwise
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 3001;

// execute_command keeps this much of the start and the end of stdout and of stderr;
// anything in between is dropped so huge outputs don't exhaust memory or the client's limits
export const COMMAND_OUTPUT_HEAD_BYTES = 20000;
export const COMMAND_OUTPUT_TAIL_BYTES = 20000;

export type ServerMode = 'mini' | 'full';

/** Parse a positive integer from an env var, falling back when it is unset or invalid. */
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

/**
 * The tool set to expose, set by index.ts from the --mini / --full flags via
 * CONTEXT_CODER_MODE. Full mode is the default.
 */
export function getMode(): ServerMode {
  return process.env.CONTEXT_CODER_MODE === 'mini' ? 'mini' : 'full';
}

/** Whether the edit_file tool is enabled (--edit / --edit-file-mode). */
export function isEditMode(): boolean {
  return process.env.CONTEXT_CODER_EDIT_MODE === 'true';
}

/**
 * Resolve the configured page size for get_codebase pagination.
 * Controlled via the COCO_PAGE_SIZE env var, which is set by the `--page-size`
 * CLI flag. Falls back to DEFAULT_PAGE_SIZE when unset or invalid.
 */
export function getConfiguredPageSize(): number {
  return parsePositiveInt(process.env.COCO_PAGE_SIZE, DEFAULT_PAGE_SIZE);
}

/**
 * Resolve the page size to suggest to the model when running under Claude Code.
 * Controlled via the COCO_CLAUDE_CODE_PAGE_SIZE env var, which is set by the
 * `--claude-code-page-size` CLI flag. Falls back to
 * DEFAULT_CLAUDE_CODE_PAGE_SIZE when unset or invalid.
 */
export function getClaudeCodePageSize(): number {
  return parsePositiveInt(process.env.COCO_CLAUDE_CODE_PAGE_SIZE, DEFAULT_CLAUDE_CODE_PAGE_SIZE);
}

/**
 * Claude token limit for get_codebase_size warnings, from COCO_CLAUDE_TOKEN_LIMIT
 * (set by `--claude-token-limit`). Falls back to DEFAULT_CLAUDE_TOKEN_LIMIT.
 */
export function getClaudeTokenLimit(): number {
  return parsePositiveInt(process.env.COCO_CLAUDE_TOKEN_LIMIT, DEFAULT_CLAUDE_TOKEN_LIMIT);
}

/**
 * GPT token limit for get_codebase_size, from COCO_GPT_TOKEN_LIMIT
 * (set by `--gpt-token-limit`). Falls back to DEFAULT_GPT_TOKEN_LIMIT.
 */
export function getGptTokenLimit(): number {
  return parsePositiveInt(process.env.COCO_GPT_TOKEN_LIMIT, DEFAULT_GPT_TOKEN_LIMIT);
}

// Folders search_files does not descend into unless the search starts inside one:
// dependencies, version control and caches, which can hold huge numbers of files
export const SEARCH_SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.venv',
  'venv',
  '.gradle',
  '.godot',
  '.svelte-kit',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
]);

export const DEFAULT_IGNORES = [
  '.cocoignore',
  '.cocominify',
  '.aidigestignore',
  '.aidigestminify',
  // Node.js
  'node_modules',
  'package-lock.json',
  'npm-debug.log',
  // Yarn
  'yarn.lock',
  'yarn-error.log',
  // pnpm
  'pnpm-lock.yaml',
  // Bun
  'bun.lockb',
  'bun.lock',
  // Deno
  'deno.lock',
  // PHP (Composer)
  'vendor',
  'composer.lock',
  // Python
  '__pycache__',
  '*.pyc',
  '*.pyo',
  '*.pyd',
  '.Python',
  'pip-log.txt',
  'pip-delete-this-directory.txt',
  '.venv',
  'venv',
  'ENV',
  'env',
  // Godot
  '.godot',
  '*.import',
  // Ruby
  'Gemfile.lock',
  '.bundle',
  // Java
  'target',
  '*.class',
  // Gradle
  '.gradle',
  'build',
  // Maven
  'pom.xml.tag',
  'pom.xml.releaseBackup',
  'pom.xml.versionsBackup',
  'pom.xml.next',
  // .NET
  'bin',
  'obj',
  '*.suo',
  '*.user',
  // Go
  'go.sum',
  // Rust
  'Cargo.lock',
  'target',
  // General
  '.git',
  '.svn',
  '.hg',
  '.DS_Store',
  'Thumbs.db',
  // Environment variables
  '.env',
  '.env.local',
  '.env.development.local',
  '.env.test.local',
  '.env.production.local',
  '*.env',
  '*.env.*',
  // Common framework directories
  '.svelte-kit',
  '.next',
  '.nuxt',
  '.vuepress',
  '.cache',
  'dist',
  'tmp',
  // Our output file
  'codebase.md',
  // Turborepo cache folder
  '.turbo',
  '.vercel',
  '.netlify',
  'LICENSE',
  //'.claude', // Claude Code garbage files
];
