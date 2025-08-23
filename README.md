# 🥥 Context Coder MCP

Context Coder (aka. Coco) provides AI models with an MCP tools to load your entire codebase into the LLM context. This gives AI assistants everything they need to write code that fits your existing patterns and architecture.

📦 **[Available on npm](https://www.npmjs.com/package/context-coder)**

## Demo

One-shot complex redesign with a vague prompt not mentioning any specific files.

https://github.com/user-attachments/assets/7eb4c39b-f069-47b5-b81a-d3d40c506f61

## Quick Start

Context Coder supports three main ways of running it:

1. Via Claude Desktop
2. Via Claude Code
3. Via other clients

#### Claude Desktop + npx

<details>
<summary>Setup instructions</summary>

Start a terminal in your current project folder and run:

```
npx context-coder
```

For line-based partial editing instead of complete file rewrites, use:

```
npx context-coder --edit-file-mode
```

Then add this to the Claude Desktop config and restart Claude Desktop afterwards:

```json
{
  "mcpServers": {
    "context-coder": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3001/mcp"]
    }
  }
}
```

Next, create a Claude Project and insert the recommended starting prompt just below this section.

</details>

#### Claude Desktop + Docker

<details>
<summary>Setup instructions</summary>

Running via Docker provides better isolation since the container won't be able to write things outside of your project directory.

Create a `docker-compose.yml` file in the project(s) you want to work on.

```yaml
services:
  context-coder:
    image: ghcr.io/khromov/context-coder:full
    ports:
      - '3001:3001'
    volumes:
      - ./:/app
    working_dir: /app
```

For the edit variant (line-based partial edits):

```yaml
services:
  context-coder:
    image: ghcr.io/khromov/context-coder:edit
    ports:
      - '3001:3001'
    volumes:
      - ./:/app
    working_dir: /app
```

Start the service:

```bash
docker-compose up
```

Then add this to the Claude Desktop config and restart Claude Desktop afterwards:

```json
{
  "mcpServers": {
    "context-coder": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3001/mcp"]
    }
  }
}
```

Since `docker-compose up` already knows which folder it's running in, we can easily switch between projects by launching `docker-compose up` in different directories. Don't forget to switch between Claude Projects when you do this!

Next, create a Claude Project and insert the recommended starting prompt just below this section.

</details>

#### Claude Desktop starting prompt

**Recommended setup and starting prompt**: Create a Claude Project and add this to your project instructions:

<details>
<summary>Starting prompt (default - without edit mode)</summary>

```
Use the Context Coder MCP to edit files. Remember that partial edits are not allowed, always write out the edited files in full through the MCP. You MUST call the get_codebase_size and get_codebase MCP tools at the start of every new chat. Do not call read_file, as you already have the codebase via get_codebase - use this reference instead. ONLY call read_file if you can't find the file in your context. Do not create any artifacts unless the user asks for it, just call the write_file tool directly with the updated code. If you get cut off when writing code and the user asks you to continue, continue from the last successfully written file to not omit anything.
```

</details>

<details>
<summary>Starting prompt (with edit mode enabled)</summary>

If you're using `--edit-file-mode`, use this prompt instead:

```
Use the Context Coder MCP to edit files. You have access to both edit_file (for line-based partial edits) and write_file (for complete file rewrites) tools. Use edit_file when making small, targeted changes and write_file when rewriting entire files or making extensive changes. Always use write_file if writing with edit_file fails. You MUST call the get_codebase_size and get_codebase MCP tools at the start of every new chat. Do not call read_file, as you already have the codebase via get_codebase - use this reference instead. ONLY call read_file if you can't find the file in your context. Do not create any artifacts unless the user asks for it, just call the MCP tools directly with the updated code. If you get cut off when writing code and the user asks you to continue, continue from the last successfully written file to not omit anything.
```

</details>

#### Claude Code

<details>
<summary>Setup instructions</summary>

**Option 1: npx**

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "context-coder": {
      "command": "npx",
      "args": ["-y", "context-coder", "--mini", "--stdio"]
    }
  }
}
```

For line-based partial editing instead of complete file rewrites, use:

```json
{
  "mcpServers": {
    "context-coder": {
      "command": "npx",
      "args": ["-y", "context-coder", "--mini", "--stdio", "--edit-file-mode"]
    }
  }
}
```

You're done!

**Option 2: Docker**

Running via Docker provides better isolation since the container won't be able to write things outside of your project directory.

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "context-coder": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v",
        "./:/app",
        "-w",
        "/app",
        "-e",
        "COCO_MCP_TRANSPORT=stdio",
        "ghcr.io/khromov/context-coder:mini"
      ]
    }
  }
}
```

**Option 3: Via HTTP + mcp-remote**

For [Claude Code](https://claude.ai/code), create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "context-coder": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3001/mcp"],
      "env": {}
    }
  }
}
```

And create `docker-compose.yml` in your project:

```yaml
services:
  context-coder:
    image: ghcr.io/khromov/context-coder:mini
    ports:
      - '3001:3001'
    volumes:
      - ./:/app
    working_dir: /app
    environment:
      - COCO_MCP_TRANSPORT=http
    restart: unless-stopped
```

Start Context Coder with `docker-compose up` and Claude Code will automatically connect.

_The reason for using the `mini` build is that Claude Code already comes with file editing tools built-in._

**Recommended starting prompt**: Add this at the start of your `CLAUDE.md` file.

```
You have access to both Claude Code's built-in file tools and the Context Coder MCP for enhanced codebase analysis. Follow this workflow:

1. ALWAYS start every new chat by calling get_codebase_size and get_codebase MCP tools to ingest and understand the full project context
2. Use Context Coders's codebase analysis as your primary reference - avoid reading files since you already have the complete codebase, only read file if you are missing something or if the user specifically requests it.
3. Remember: Context Coder gives you full codebase context, Claude Code gives you precise editing control - use both strategically
```

</details>

## Limiting which files are including when fetching the codebase

Context Coder works best in small and medium-sized repositories, as it's limited to the maximum context of your LLM (in the case of Claude Sonnet/Opus 4, that's 200,000 tokens). Your whole codebase might not fit, and for this case you have two options.

### Excluding Files (.cocoignore)

Create a `.cocoignore` file in the root of your project. This file works similarly to .gitignore, allowing you to specify files and directories that should be excluded from the command to aggregate your code - this could be test fixtures, snapshots, large test files or other secondary information that isn't useful to the LLM.

### Minifying Files (.cocominify)

Create a `.cocominify` file in the root of your project to include files with placeholder content instead of excluding them entirely. This saves tokens while still informing the AI that the files exist and allows the AI to read them with the `read_file` tool if necessary. This is useful for large generated files, compiled assets, or files that don't need their full content in the AI context.

Many common build artifacts and folders are already automatically excluded (such as `node_modules`). The LLM can also help you with this - ask it to run the `get_codebase_top_largest_files` tool and suggest files that are large and/or suitable for inclusion in a `.cocoignore` or `.cocominify` file.

### Combining

You can have both a `.cocoignore` and a `.cocominify` file in the same repo.

## Configuration

<details>
<summary>Volume Mounts and Environment Variables</summary>

### Volume Mounts

Mount a specific directory:

```yaml
volumes:
  - ./src:/app # Only expose src directory
```

### Environment Variables

- `COCO_DEV`: "true" or "false" to mount the `./mount` folder instead of using `/app`
- `COCO_MCP_TRANSPORT`: Set to `stdio` or `http` (default: `http`)
- `COCO_PORT`: Override default port 3001 (HTTP mode only)
- `CONTEXT_CODER_EDIT_MODE`: Set to "true" to enable `edit_file` tool (equivalent to `--edit-file-mode` flag)

</details>

## Available Tools

| Tool                             | Purpose                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **`get_codebase_size`**          | **Check codebase size and token counts - LLMs should call this first to ensure codebase isn't too large** |
| **`get_codebase`**               | **Generate AI-digestible summary of entire codebase (paginated) - Call after checking size**              |
| `get_codebase_top_largest_files` | Get top X largest files in codebase - helpful for identifying files to add to .cocoignore/.cocominify     |
| `read_file`                      | Read file contents (only use when specifically asked to re-read or for debugging)                         |
| `write_file`                     | Create or overwrite files                                                                                 |
| `edit_file`                      | Make line-based partial edits to files (available when `--edit-file-mode` is enabled)                     |
| `create_directory`               | Create directories                                                                                        |
| `list_directory`                 | List directory contents (only use when specifically asked or for debugging)                               |
| `directory_tree`                 | Get directory structure as JSON (only use when specifically asked or for debugging)                       |
| `move_file`                      | Move or rename files                                                                                      |
| `search_files`                   | Search by pattern                                                                                         |
| `execute_command`                | Run shell commands                                                                                        |

## Available Prompts

Context Coder provides MCP prompts that help configure Claude properly for your development workflow:

| Prompt                             | Purpose                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| **`context-coder-claude-desktop`** | Default starting prompt for Claude Desktop - configures proper MCP tool usage         |
| **`context-coder-claude-code`**    | Default starting prompt for Claude Code - explains how to use both tool sets together |

_To use these prompts in Claude Code:_

1. Type `/` to open the prompt menu
2. Find "context-coder" in the list, then "Context Coder: Claude Code Setup"
3. The prompt will be inserted automatically
4. You may directly add a task after the prompt, eg `/context-coder:Context Coder: Claude Code Setup (MCP) Add a new endpoint that returns a random number`

_To use these prompts in Claude Desktop:_

Use the "plus" button just below the chat text box, the `Add from <name of server>`.

## CLI Commands

Context Coder also provides a convenient CLI command to inspect your codebase:

### List Files Command

```bash
npx context-coder ls [options]
```

Lists all files that will be included in the codebase analysis, showing file sizes and respecting `.cocoignore` and `.cocominify` patterns.

**Options:**

- `--sort-by <type>` - Sort by "size" or "path" (default: "size")
- `-r, --reverse` - Reverse sort order (ascending instead of descending)
- `-d, --directory <dir>` - Directory to analyze (default: current directory)
- `--help` - Show usage information

**Examples:**

```bash
npx context-coder ls                           # Default: sort by size descending
npx context-coder ls --sort-by path            # Sort alphabetically by path
npx context-coder ls -r                        # Sort by size ascending
npx context-coder ls --sort-by path --reverse  # Sort by path Z-A
npx context-coder ls -d ./src                  # Analyze specific directory
```

The command shows:

- Total file count and token estimates for Claude and ChatGPT
- Whether `.cocoignore` and `.cocominify` files are being used
- Formatted list of all files with sizes

### Runtime Options

Context Coder supports several runtime options to modify its behavior:

```bash
npx context-coder [options]
```

**Options:**

- `-m, --mini` - Run in mini mode (only core tools)
- `-f, --full` - Run in full mode (all tools) - this is the default
- `-s, --stdio` - Use stdio transport instead of HTTP
- `-e, --edit` - Enable the `edit_file` tool for line-based partial edits instead of requiring complete file rewrites with `write_file`
- `--edit-file-mode` - Same as `-e, --edit` (legacy flag)
- `-p, --port <number>` - Port to listen on (default: 3001)
- `-c, --claude-token-limit <number>` - Set Claude token limit - useful for models with larger context windows (default: 150000)
- `-g, --gpt-token-limit <number>` - Set GPT token limit - useful for models with larger context windows (default: 128000)

**Examples:**

```bash
npx context-coder                           # Default: full mode with HTTP transport
npx context-coder -m                        # Mini mode with core tools only
npx context-coder -s                        # Use stdio transport (for Claude Code)
npx context-coder -e                        # Enable partial file editing
npx context-coder -p 8080                   # Use port 8080 instead of 3001
npx context-coder -m -s                     # Combine options for mini mode with stdio
npx context-coder -s -e -p 8080             # stdio transport with edit mode enabled and custom port
```

**Token Limit Examples:**

Context Coder helps detect when your codebase might exceed your model's context window. You can adjust these limits based on the model you're using:

```bash
# For Claude Enterprise with 500k context window
npx context-coder -c 500000

# For GPT-4 Turbo with 128k context
npx context-coder -g 128000

# For models with very large context windows
npx context-coder -c 1000000 -g 1000000

# Combine with other options
npx context-coder --edit-file-mode -c 300000 -p 8080
```

**Model Context Window Reference:**

- **Claude Sonnet 3.5**: ~200k tokens
- **Claude Enterprise**: ~500k tokens
- **GPT-4**: ~128k tokens
- **GPT-4 Turbo**: ~128k tokens
- **Custom/Local Models**: Varies widely

Setting appropriate token limits helps Context Coder provide better warnings when your codebase might not fit in your model's context window.

## Development

<details>
<summary>Development setup and commands</summary>

Clone and install dependencies:

```bash
npm install
```

Build and run:

```bash
npm run build
npm start  # HTTP mode
npm start -- --stdio  # stdio mode
```

Development mode with auto-reload:

```bash
npm run dev
```

In development mode, file operations are sandboxed to the `./mount` directory.

</details>

## Docker Variants

Context Coder provides three Docker variants:

| Variant  | Image                                | Description                                                                                      |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **Full** | `ghcr.io/khromov/context-coder:full` | Full mode with all tools using `write_file` (complete file rewrites)                             |
| **Mini** | `ghcr.io/khromov/context-coder:mini` | Core analysis tools only (`get_codebase_size`, `get_codebase`, `get_codebase_top_largest_files`) |
| **Edit** | `ghcr.io/khromov/context-coder:edit` | Full mode with `edit_file` tool for line-based partial edits in addition to `write_file`         |

## Docker Build

<details>
<summary>Docker build instructions</summary>

Build all versions:

```bash
./build-all.sh
```

Or build individually:

```bash
# Full version
docker build -t context-coder:latest .

# Mini version
docker build --build-arg COCO_BUILD_TYPE=mini -t context-coder:mini .

# Edit version
docker build --build-arg COCO_BUILD_TYPE=edit -t context-coder:edit .
```

Build a custom image:

```dockerfile
FROM ghcr.io/khromov/context-coder:full
# Add customizations
```

Or build from source:

```bash
docker build -t my-coco .
```

</details>

## License

MIT
