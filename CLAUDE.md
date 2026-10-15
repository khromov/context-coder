# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

When the Context Coder MCP is connected (see `.mcp.json`; its server entries are currently disabled), use it alongside Claude Code's built-in tools:

1. Start every new chat by calling the `get_codebase_size` and `get_codebase` MCP tools to ingest the full project context.
2. Treat that digest as your primary reference. Only read a file if it is missing from the digest or the user asks you to.
3. Context Coder gives you full codebase context, and Claude Code gives you precise editing control. Use both.

## Project Overview

Context Coder (aka Coco, published on npm as `context-coder`) is an MCP server that lets an LLM load an entire codebase into its context (via `ai-digest`) and, in full mode, operate on files within a single root directory.

## Commands

```bash
npm run build          # rm dist, tsc, copy instructions.md into dist/
npm run dev            # nodemon: rebuild + run on src changes, port 3002, COCO_DEV=true (./mount sandbox)
npm run dev:stdio      # same, stdio transport
npm start              # node dist/index.js (HTTP, port 3001)
npm run lint           # eslint src/**/*.ts
npm run format         # prettier on src/**/*.ts and root *.json/*.md
npm run format:check
npm run mcp            # launch the MCP Inspector
```

**Testing:**

```bash
npm test               # builds first, then runs all Jest tests
# Single test file (no build step; run `npm run build` first for cli/stdio/streamableHttp tests):
node --experimental-vm-modules node_modules/jest/bin/jest.js src/__tests__/handlers/read_file.test.ts
# Filter by test name:
node --experimental-vm-modules node_modules/jest/bin/jest.js -t "pattern"
```

Never run `npm run test:watch`; it never exits.

The `cli`, `stdio` and `streamableHttp` tests spawn `dist/index.js`, which is why `npm test` builds first. CI (`.github/workflows/`) runs lint, `format:check` and tests on Node 22 on both **ubuntu and windows**, so path handling must work with `\` separators (normalize to `/` in output).

The husky pre-commit hook runs `npm run format` and then **`git add -A`**, so any untracked file in the working tree ends up in the commit.

## Architecture

**Startup and config flow:** `src/index.ts` (commander CLI) parses flags and writes them into env vars (`CONTEXT_CODER_MODE`, `CONTEXT_CODER_EDIT_MODE`, `COCO_PAGE_SIZE`, `COCO_CLAUDE_CODE_PAGE_SIZE`, `COCO_CLAUDE_TOKEN_LIMIT`, `COCO_GPT_TOKEN_LIMIT`). Only then does it dynamically import `stdio.ts` or `streamableHttp.ts`. This ordering matters: `tools.ts` reads `CONTEXT_CODER_EDIT_MODE` and the Claude Code page size **at module load time** to build the tool list and descriptions, so these modules must not be imported statically from `index.ts`. Modules read config from `process.env`, not from passed-in options.

**Layers:**

- `stdio.ts` / `streamableHttp.ts`: transports. HTTP (Express, `/mcp` and `/health`) creates a new MCP `Server` per session, keyed by the `mcp-session-id` header. In stdio mode all logging must go to stderr; `configureLogger()` in `logger.ts` handles this, so use `logger` rather than `console.log`.
- `mcp.ts`: `createServer()` resolves the root dir (`./mount` when `COCO_DEV=true`, otherwise cwd) and dispatches `CallTool` to `tool.handler(args, { absoluteRootDir })`. It also loads `instructions.md` from next to the compiled file (hence the copy into `dist/` during the build) and fills its `{EDIT_FILE_TOOL_LIST}` / `{EDITING_STRATEGY}` / `{EFFICIENT_EDITING_PRACTICE}` placeholders based on edit mode. MCP prompts live in `lib/prompts.ts`.
- `tools.ts`: the tool registry. `miniTools` (`get_codebase_size`, `get_codebase`, `get_codebase_top_largest_files`) are always exposed. Full mode adds `read_file`, `write_file`, `remove_file`, `create_directory`, `list_directory`, `directory_tree`, `move_file`, `search_files`, `execute_command`, plus `edit_file` only in edit mode. **Mode defaults to full**; mini must be requested with `--mini`.
- `handlers/<tool>.ts`: one file per tool. A handler parses `args` with its Zod schema from `schemas.ts` (the same schema is converted to JSON Schema for the tool definition), validates paths, and returns `{ content: [{ type: 'text', text }] }`. Thrown errors are converted into `isError` responses by `mcp.ts`.
- `codebase-digest.ts`: wraps `ai-digest`. Pagination is by character count: files are packed into pages up to the page size, a single file larger than a page is replaced with an omission notice, and each page ends with an instruction telling the model whether to call again. The page size comes from `_pageSize` in the call args, then `COCO_PAGE_SIZE`, then 99000 (Claude Desktop caps results at 100k chars).

**Adding a tool:** add a Zod schema in `schemas.ts`, a handler in `src/handlers/`, register it in `miniTools` or `additionalTools` in `tools.ts`, and update `instructions.md` and the README tool table if models or users need to know about it.

**Path security:** every user-supplied path must go through `validateRelativePath()` and then `resolveRelativePath(path, context.absoluteRootDir)`, both in `src/handlers/utils.ts`. Paths may be given with or without a `./` prefix; any `..` segment is rejected. File writes use `writeFileSecure()` in `file-operations.ts` (exclusive create, otherwise a temp file plus atomic rename).

**Ignore and minify files:** `get_codebase*` and the `ls` subcommand honor `.cocoignore` and `.cocominify` in the target root, falling back to the legacy `.aidigestignore` and `.aidigestminify`. Minified files appear in the digest as a placeholder that tells the model to use `read_file`. Built-in ignores are in `DEFAULT_IGNORES` in `constants.ts`.

**execute_command:** runs commands through a shell (`/bin/sh` or `cmd.exe`). On POSIX each command gets its own process group (`detached`), so timeouts and server shutdown kill the whole tree via `killAllRunningCommands()`, which both transports call on SIGINT, SIGTERM, SIGHUP and exit.

## Tests

Tests live in `src/__tests__/` (Jest with ts-jest ESM preset; imports use `.js` suffixes, which `moduleNameMapper` strips). Handler tests use `handlers/test-utils.ts`: `setupTestDir()` creates a temp dir under `src/__tests__/handlers/test-handlers-temp/` (removed by `src/jest.teardown.js`), and `createTestContext(dir)` builds the `HandlerContext`. Tests are excluded from `tsc` and have their own ESLint block.

## Docker

The multi-stage `Dockerfile` takes a `BUILD_TYPE` build arg (`regular`/`full`, `mini`, `edit`) and bakes it into `COCO_BUILD_TYPE`. `entrypoint.sh` maps that to `--mini`, `--full` or `--full --edit-file-mode`, and `COCO_MCP_TRANSPORT=stdio` switches it to `--stdio`. CI publishes the `full`, `mini` and `edit` images to GHCR on every push to main. Note that `build-all.sh` and the README pass `--build-arg COCO_BUILD_TYPE=...`, which the Dockerfile does not declare, so those builds fall back to `regular`.

## Environment Variables

- `COCO_DEV=true`: sandbox to `./mount` (set by the `dev*` scripts)
- `COCO_PORT` / `--port`: HTTP port (default 3001)
- `COCO_MCP_TRANSPORT`: `http` (default) or `stdio`; takes precedence over `--stdio`
- `COCO_PAGE_SIZE` / `--page-size`: `get_codebase` page size in characters (default 99000)
- `COCO_CLAUDE_CODE_PAGE_SIZE` / `--claude-code-page-size`: `_pageSize` value suggested in the tool description for Claude Code (default 30000)
- `COCO_CLAUDE_TOKEN_LIMIT` / `-c`, `COCO_GPT_TOKEN_LIMIT` / `-g`: warning thresholds in `get_codebase_size` (defaults 150000 / 128000)
- `CONTEXT_CODER_MODE` (`mini`/`full`) and `CONTEXT_CODER_EDIT_MODE` (`true`): normally set by CLI flags, not by hand
