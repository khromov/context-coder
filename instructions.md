# 🥥 Coco MCP Server Instructions

## Overview

Coco (Context Coder) is an MCP server that provides AI assistants with comprehensive codebase awareness. Unlike traditional file-by-file approaches, Coco enables you to understand entire project structures instantly through its intelligent code digestion capabilities.

## Primary Workflow

### 1. Check Codebase Size First

**ALWAYS begin by calling `get_codebase_size`** - This is critical to ensure the codebase isn't too large for processing. This tool:

- Checks total token counts for Claude and ChatGPT
- Warns if the codebase exceeds the configured Claude token limit (150k tokens by default)
- When it does, lists the largest files so the user can exclude some of them
- Suggests creating a `.cocoignore` file if needed

### 2. Get Full Context

After checking the size, **call `get_codebase`** - This provides a complete representation of the entire codebase, giving you immediate understanding of:

- Project structure and organization
- All code files and their contents
- Dependencies and relationships
- Overall architecture patterns

The digest is paginated (about 100k characters per page by default). If you see a message like "You MUST call this tool again with page...", continue retrieving pages with get_codebase using the page parameter until you have the complete context.

### 3. Work with Full Context

Once you have the codebase digest, you can:

- Answer questions about any part of the code
- Suggest improvements that align with existing patterns
- Write new code that fits the project's style
- Understand complex interactions between components

<!-- full-mode -->

### 4. Modify with Confidence

Use editing tools to make changes:

{EDIT_FILE_TOOL_LIST}

- `write_file` - Create or completely overwrite files
- `create_directory` - Set up new directories
- `move_file` - Reorganize code structure

{EDITING_STRATEGY}

### 5. Use Other Tools Sparingly

Only use these tools when specifically needed:

- `read_file` - Only when explicitly asked to re-read a file or when the digest doesn't contain what you need
- `list_directory` - Only when users ask "what files are in X directory?"
- `directory_tree` - Only when users request a visual tree structure
- `search_files` - When looking for files by name. It skips folders such as `node_modules` and `.git` unless the search starts inside one
- `execute_command` - For running build/test commands. Commands run through a shell, so quoting, pipes and `&&` work; quote shell metacharacters (`& | ( ) ; # $ *`) when you mean them literally. Background jobs must redirect their output (`cmd >/dev/null 2>&1 &`), otherwise the call blocks until the timeout. Commands get no stdin, and very long output is shortened to its start and end. Note that tools like `grep` exit with code 1 when nothing matches

<!-- /full-mode -->

<!-- mini-mode -->

### 4. Read and Edit with Your Own Tools

This server is running in mini mode, so it only provides the codebase tools above. Use your client's own tools to read, create, edit and search files and to run commands.

<!-- /mini-mode -->

## Managing Large Codebases

If `get_codebase_size` warns about a large codebase:

1. **Create a `.cocoignore` file** in the project root (similar to `.gitignore`)
2. Add patterns for files/directories to exclude:

```gitignore
# Large generated files
dist/
build/
*.min.js

# Dependencies
node_modules/
vendor/

# Large data files
*.csv
*.json
data/
```

3. Common patterns to exclude:
   - Build outputs (`dist/`, `build/`, `out/`)
   - Dependencies (`node_modules/`, `vendor/`, `.venv/`)
   - Generated files (`*.min.js`, `*.map`)
   - Large assets (`images/`, `videos/`)
   - Data files (`*.csv`, `*.json`, `*.sql`)

Files whose content isn't needed but whose existence matters can go in a `.cocominify` file instead. They stay in the digest as a short placeholder.

## Path Conventions

All paths are relative to the root directory Coco was started in:

- Use paths with or without a "./" prefix: `./src/index.ts` or `src/index.ts`
- Parent directory access ("../") is blocked for security, and so are symlinks that lead outside the root directory
- In development mode, "./" maps to the `./mount` directory

## Best Practices

- **Size Check First**: Always run `get_codebase_size` before `get_codebase`
- **Context Awareness**: Use the full codebase context to understand patterns
- **Respect Patterns**: Follow existing conventions found in the codebase
- **Minimal Reads**: Avoid redundant file reads when information is already in context
- **Smart Navigation**: Use search instead of browsing when looking for specific code

<!-- full-mode -->

- {EFFICIENT_EDITING_PRACTICE}
- **Safe Operations**: File writes are atomic, and file tools stay inside the root directory

<!-- /full-mode -->

Remember: Coco's strength is complete context awareness. Use it to write better, more integrated code that truly fits the project.
