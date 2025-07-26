# 🥥 Context Coder MCP

Context Coder (aka. Coco) provides AI models with an MCP tools to load your entire codebase into the LLM context. This gives AI assistants everything they need to write code that fits your existing patterns and architecture.

📦 **[Available on npm](https://www.npmjs.com/package/context-coder)**

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
<summary>Starting prompt</summary>

```
Use the Context Coder MCP to edit files. Remember that partial edits are not allowed, always write out the edited files in full through the MCP. You MUST call the get_codebase_size and get_codebase MCP tools at the start of every new chat. Do not call read_file, as you already have the codebase via get_codebase - use this reference instead. ONLY call read_file if you can't find the file in your context. Do not create any artifacts unless the user asks for it, just call the write_file tool directly with the updated code. If you get cut off when writing code and the user asks you to continue, continue from the last successfully written file to not omit anything.
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
        "MCP_TRANSPORT=stdio",
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
      - MCP_TRANSPORT=http
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

Context Coder works best in small and medium-sized repositories, as it's limited to the maximum context of your LLM (in the case of Claude Sonnet/Opus 4, that's 200,000 tokens). Your whole codebase might not fit, and for this case you can create a `.cocoignore` file in the root of your project. This file works similarly to .gitignore, allowing you to specify files and directories that should be excluded from the command to aggregate your code - this could be test fixtures, snapshots, large test files or other secondary information that isn't useful to the LLM. Many common build artifacts and folders are already automatically excluded (such as `node_modules`). The LLM can also help you with this - ask it to run the `get_codebase_top_largest_files` tool and suggest files that are large and/or suitable for inclusion in a `.cocoignore` file.

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
- `MCP_TRANSPORT`: Set to `stdio` or `http` (default: `http`)
- `PORT`: Override default port 3001 (HTTP mode only)

</details>

## Available Tools

| Tool                             | Purpose                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **`get_codebase_size`**          | **Check codebase size and token counts - LLMs should call this first to ensure codebase isn't too large** |
| **`get_codebase`**               | **Generate AI-digestible summary of entire codebase (paginated) - Call after checking size**              |
| `get_codebase_top_largest_files` | Get top X largest files in codebase - helpful for identifying files to add to .cocoignore                 |
| `read_file`                      | Read file contents (only use when specifically asked to re-read or for debugging)                         |
| `write_file`                     | Create or overwrite files                                                                                 |
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

To use these prompts in Claude Code:

1. Type `/` to open the prompt menu
2. Find "context-coder" in the list, then "Context Coder: Claude Code Setup"
3. The prompt will be inserted automatically
4. You may directly add a task after the prompt, eg `/context-coder:Context Coder: Claude Code Setup (MCP) Add a new endpoint that returns a random number`

To use these prompts in Claude Desktop:

_As of the writing of this README, Claude Desktop does not support MCP Prompts. Create a Claude Project and use the prompts from this README.md file as the project instructions._

## CLI Commands

Context Coder also provides a convenient CLI command to inspect your codebase:

### List Files Command

```bash
npx context-coder ls [options]
```

Lists all files that will be included in the codebase analysis, showing file sizes and respecting `.cocoignore` patterns.

**Options:**

- `--sort-by <type>` - Sort by "size" or "path" (default: "size")
- `--reverse` - Reverse sort order (ascending instead of descending)
- `--directory <dir>` - Directory to analyze (default: current directory)
- `--help` - Show usage information

**Examples:**

```bash
npx context-coder ls                           # Default: sort by size descending
npx context-coder ls --sort-by path            # Sort alphabetically by path
npx context-coder ls --reverse                 # Sort by size ascending
npx context-coder ls --sort-by path --reverse  # Sort by path Z-A
npx context-coder ls --directory ./src         # Analyze specific directory
```

The command shows:

- Total file count and token estimates for Claude and ChatGPT
- Whether a `.cocoignore` file is being used
- Formatted list of all files with sizes

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

## Docker Build

<details>
<summary>Docker build instructions</summary>

Build both versions:

```bash
./build-all.sh
```

Or build individually:

```bash
# Full version
docker build -t context-coder:latest .

# Mini version
docker build --target release-mini --build-arg BUILD_TYPE=mini -t context-coder:mini .
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
