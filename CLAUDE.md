# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

You have access to both Claude Code's built-in file tools and the Coco MCP for enhanced codebase analysis. Follow this workflow:

1. ALWAYS start every new chat by calling get_codebase_size and get_codebase MCP tools to ingest and understand the full project context
2. Use Coco's codebase analysis as your primary reference - avoid reading files since you already have the complete codebase, only read file if you are missing something or if the user specifically requests it.
3. Remember: Coco gives you full codebase context, Claude Code gives you precise editing control - use both strategically

## Project Overview

Coco MCP (Context Coder) is a secure file system access server implementing the Model Context Protocol. It provides AI models with controlled file operations within designated directories.

## Essential Commands

**Development:**

```bash
npm run dev          # Start development server with auto-reload (port 3002, ./mount sandbox)
npm run build        # Compile TypeScript to dist/
npm start            # Run production server (port 3001)
```

**Testing:**

```bash
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode - never run this, it will get stuck
npm run test:coverage # Generate coverage report
```

**Code Quality:**

```bash
npm run format       # Format code with Prettier - run this when you finished with all your changes
npm run format:check # Check code formatting
npm run watch        # TypeScript compiler in watch mode
```

## Architecture

The server follows a layered architecture:

1. **Transport Layer** (`src/streamableHttp.ts`): Handles HTTP/SSE communication with session management
2. **MCP Layer** (`src/mcp.ts`): Implements the Model Context Protocol server with 11 file operation tools
3. **Tool Layer** (`src/tools.ts` + `src/handlers/`): Modular handlers for each MCP tool with Zod validation
4. **File Operations** (`src/file-operations.ts`): Secure file system utilities with path validation
5. **Codebase Digest** (`src/codebase-digest.ts`): Handles AI-digest integration for token counting and file analysis

**Key Design Decisions:**

- All file paths must be relative (starting with "./")
- Parent directory access ("../") is blocked for security
- In development mode, operations are sandboxed to the `./mount` directory
- The server validates all paths to prevent directory traversal attacks
- Large codebases are handled with token counting and size warnings

## Development Notes

When working on this codebase:

1. **Path Handling**: Always use the `validatePath()` function from file-operations.ts when dealing with user-provided paths
2. **Error Messages**: Include the actual error details in responses to help with debugging
3. **Testing**: Add tests in `src/__tests__/` following the existing Jest/TypeScript setup with ESM support
4. **Handler Pattern**: New MCP tools should follow the modular handler pattern - create handler in `src/handlers/` and register in `src/tools.ts`
5. **Docker**: The Dockerfile uses a multi-stage build. Test Docker changes with `docker-compose up --build`
6. **Token Limits**: Be aware of Claude (150k) and ChatGPT (128k) token limits when processing codebases
7. **Mode Selection**: Server runs in 'mini' mode by default. Use `--full` flag or set `CONTEXT_CODER_MODE=full` for all tools
8. **Development Sandbox**: In dev mode (`COCO_DEV=true`), file operations are sandboxed to `./mount` directory
9. **Git Hooks**: The project uses the `pre-commit` package to automatically format code before commits (configured in package.json)

## Environment Variables

All environment variables use the `COCO_` prefix for consistency:

- `COCO_PORT`: Server port (default: 3001) - can also be set via `--port` CLI flag
- `COCO_DEV`: Set to "true" for development mode (uses ./mount sandbox)
- `COCO_MCP_TRANSPORT`: Transport protocol - "http" or "stdio" (default: "http")
- `COCO_BUILD_TYPE`: Docker build variant - "regular", "mini", or "edit"
- `CONTEXT_CODER_MODE`: Runtime mode - "mini" or "full" (set by CLI flags)
- `CONTEXT_CODER_EDIT_MODE`: Enable edit_file tool when set to "true"

## Available Tools

The server exposes 11 MCP tools for file operations (mini mode has 3, full mode adds 8 more):

**Mini Mode Tools (always available):**

- `get_codebase_size` - Check codebase size and token counts before processing
- `get_codebase` - Generate paginated summary of entire codebase
- `get_codebase_top_largest_files` - Get top X largest files for .cocoignore/.cocominify optimization

**Full Mode Additional Tools:**

- File operations: `read_file`, `write_file`, `move_file`
- Directory operations: `list_directory`, `directory_tree`, `create_directory`
- Search: `search_files`
- Command execution: `execute_command`
- Line-based editing: `edit_file` (when edit mode is enabled)

**Important Workflow:**

1. Always run `get_codebase_size` FIRST to check if the codebase is within token limits
2. Then run `get_codebase` to get the actual code content
3. Use other tools only when specifically needed

See `src/mcp.ts` for the complete tool implementations.
