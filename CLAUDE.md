# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Context Coder (internally "context-coder", formerly "safe-file-mcp") is an MCP (Model Context Protocol) server that provides AI models with tools to load entire codebases into LLM context. It enables AI assistants to understand project structure and write code that fits existing patterns.

The project is built with TypeScript and uses the `tmcp` library for MCP server implementation, offering both HTTP and stdio transport modes.

## Key Architecture

### Core Components

- **`src/index.ts`**: CLI entry point with commander.js, handles server startup and mode selection
- **`src/mcp.ts`**: MCP server creation using tmcp library with Zod schema validation
- **`src/tools.ts`**: Tool registry with mini/full mode support and handler management
- **`src/handlers/`**: Individual tool implementations (get_codebase, write_file, etc.)
- **`src/codebase-digest.ts`**: Core codebase analysis and markdown generation logic
- **`src/schemas.ts`**: Zod schemas for all tool input validation

### Operating Modes

- **Mini mode**: Core analysis tools only (`get_codebase_size`, `get_codebase`, `get_codebase_top_largest_files`)
- **Full mode**: All tools including file operations, directory management, and command execution
- **Edit mode**: Adds `edit_file` tool for line-based partial edits alongside `write_file`

### Transport Modes

- **HTTP mode**: Default, runs on port 3001, used with Claude Desktop + mcp-remote
- **stdio mode**: Direct stdin/stdout communication, used with Claude Code and direct integrations

## Development Commands

### Build and Start

```bash
npm run build              # Compile TypeScript to dist/
npm start                  # Start in HTTP mode
npm run start:stdio        # Start in stdio mode
npm run start:edit         # Start with edit-file mode enabled
```

### Development

```bash
npm run dev                # Auto-reload HTTP mode (uses ./mount directory)
npm run dev:stdio          # Auto-reload stdio mode
npm run dev:edit           # Auto-reload with edit mode
npm run watch              # TypeScript watch mode
```

### Testing and Quality

```bash
npm test                   # Run full test suite with build
npm run test:watch         # Watch mode testing
npm run test:coverage      # Generate coverage report
npm run lint               # ESLint check
npm run lint:fix           # ESLint auto-fix
npm run format             # Prettier format
npm run format:check       # Prettier check only
```

### CLI Tools

```bash
npx context-coder ls                    # List files that will be analyzed
npx context-coder ls --sort-by path     # Sort by path instead of size
npx context-coder --mini --stdio        # Run in mini mode with stdio
```

## File Structure Conventions

### Handler Pattern

All tool handlers in `src/handlers/` follow this pattern:

- Import schema from `../schemas.js`
- Validate input with `schema.safeParse(args)`
- Use `validateRelativePath()` and `resolveRelativePath()` from `./utils.js`
- Return `HandlerResponse` with `content: [{ type: 'text', text: string }]` format
- Log operations with structured logging

### Schema Definitions

Zod schemas in `src/schemas.ts` use:

- Relative path validation with optional `./` prefix
- Default values with `.default()` and `.optional()`
- Descriptive `.describe()` for MCP tool documentation

### Test Structure

- `src/__tests__/` for main test files
- `src/handlers/__tests__/` for handler-specific tests
- `test-utils.ts` provides common test utilities
- Tests use temporary directories and cleanup

## Environment Variables

### Core Configuration

- `CONTEXT_CODER_MODE`: `mini` | `full` (set by CLI flags)
- `CONTEXT_CODER_EDIT_MODE`: `true` to enable edit_file tool
- `COCO_MCP_TRANSPORT`: `http` | `stdio`
- `COCO_PORT`: Override default port 3001
- `COCO_DEV`: `true` uses `./mount` instead of `./`

### Token Limits

- `COCO_CLAUDE_TOKEN_LIMIT`: Override default 150000
- `COCO_GPT_TOKEN_LIMIT`: Override default 128000

## Important Implementation Details

### Path Handling

All file operations use relative paths that are:

1. Validated with `validateRelativePath()` to prevent directory traversal
2. Resolved with `resolveRelativePath()` against the configured root directory
3. Support both `file.txt` and `./file.txt` formats

### Codebase Analysis

The `generateCodebaseDigest()` function:

- Respects `.cocoignore` files (gitignore format)
- Provides pagination for large codebases
- Calculates token estimates for Claude and GPT models
- Excludes common build artifacts and dependencies

### MCP Integration

- Uses `tmcp` library with Zod adapter for schema validation
- Supports both tools and prompts
- Handles proper error formatting for MCP responses
- Provides structured logging for debugging

## Docker and Deployment

The project builds three Docker variants:

- `full`: Complete toolset with write_file
- `mini`: Analysis tools only
- `edit`: Full toolset with edit_file enabled

Build targets are controlled by `COCO_BUILD_TYPE` environment variable in Docker builds.

## Testing Strategy

- Unit tests for all handlers with temporary file systems
- Integration tests for server startup in both transport modes
- Coverage collection excludes dist/ and node_modules/
- Jest configured for ESModules with ts-jest
