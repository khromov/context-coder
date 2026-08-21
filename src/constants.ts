// Default page size (in characters) for get_codebase pagination.
// Claude Desktop limits to 100,000 characters per page, so we leave some buffer.
export const DEFAULT_PAGE_SIZE = 99000;

/**
 * Resolve the configured page size for get_codebase pagination.
 * Controlled via the COCO_PAGE_SIZE env var, which is set by the `--page-size`
 * CLI flag. Falls back to DEFAULT_PAGE_SIZE when unset or invalid.
 */
export function getConfiguredPageSize(): number {
  const raw = process.env.COCO_PAGE_SIZE;
  if (!raw) return DEFAULT_PAGE_SIZE;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_PAGE_SIZE : parsed;
}

// Page size (in characters) suggested to the model when it runs under Claude
// Code, which has a smaller per-page limit than the default. This value is
// surfaced in the get_codebase tool description.
export const DEFAULT_CLAUDE_CODE_PAGE_SIZE = 30000;

/**
 * Resolve the page size to suggest to the model when running under Claude Code.
 * Controlled via the COCO_CLAUDE_CODE_PAGE_SIZE env var, which is set by the
 * `--claude-code-page-size` CLI flag. Falls back to
 * DEFAULT_CLAUDE_CODE_PAGE_SIZE when unset or invalid.
 */
export function getClaudeCodePageSize(): number {
  const raw = process.env.COCO_CLAUDE_CODE_PAGE_SIZE;
  if (!raw) return DEFAULT_CLAUDE_CODE_PAGE_SIZE;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_CLAUDE_CODE_PAGE_SIZE : parsed;
}

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
