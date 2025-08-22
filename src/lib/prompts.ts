export interface Prompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export const prompts: Prompt[] = [
  {
    name: 'context-coder-claude-desktop',
    title: 'Context Coder: Claude Desktop Setup',
    description:
      'Default starting prompt for using Context Coder with Claude Desktop. This prompt configures Claude to use the Context Coder MCP tools properly and establishes the workflow.',
    arguments: [
      {
        name: 'task',
        description: 'Your initial task or question about the codebase',
        required: false,
      },
    ],
  },
  {
    name: 'context-coder-claude-code',
    title: 'Context Coder: Claude Code Setup',
    description:
      "Default starting prompt for using Context Coder with Claude Code. This prompt explains how to use both Claude Code's built-in tools and Context Coder together.",
    arguments: [
      {
        name: 'task',
        description: 'Your initial task or question about the codebase',
        required: false,
      },
    ],
  },
];

export const getPromptContent = (
  name: string,
  args?: Record<string, any>
): Array<{ role: string; content: { type: string; text: string } }> => {
  const messages: Array<{ role: string; content: { type: string; text: string } }> = [];

  // Check if edit mode is enabled
  const editModeEnabled = process.env.CONTEXT_CODER_EDIT_MODE === 'true';

  switch (name) {
    case 'context-coder-claude-desktop': {
      const desktopEditingText = editModeEnabled
        ? 'You have access to both edit_file (for line-based partial edits) and write_file (for complete file rewrites) tools. Use edit_file when making small, targeted changes and write_file when rewriting entire files or making extensive changes. Always use write_file if writing with edit_file fails.'
        : 'Remember that partial edits are not allowed, always write out the edited files in full through the MCP.';

      messages.push({
        role: 'user',
        content: {
          type: 'text',
          text: `Use the Context Coder MCP to edit files. ${desktopEditingText} You MUST call the get_codebase_size and get_codebase MCP tools at the start of every new chat. Do not call read_file, as you already have the codebase via get_codebase - use this reference instead. ONLY call read_file if you can't find the file in your context. Do not create any artifacts unless the user asks for it, just call the ${editModeEnabled ? 'MCP tools directly' : 'write_file tool directly'} with the updated code. If you get cut off when writing code and the user asks you to continue, continue from the last successfully written file to not omit anything.`,
        },
      });
      break;
    }

    case 'context-coder-claude-code': {
      const codeEditingText = editModeEnabled
        ? "3. For file editing: Use Context Coder's edit_file tool for small, targeted changes (line-based partial edits) and write_file for complete file rewrites. You can also use Claude Code's built-in file editing tools when appropriate.\n4. Remember: Context Coder gives you full codebase context and flexible editing options, Claude Code gives you precise editing control - use both strategically"
        : '3. Remember: Context Coder gives you full codebase context, Claude Code gives you precise editing control - use both strategically';

      messages.push({
        role: 'user',
        content: {
          type: 'text',
          text: `You have access to both Claude Code's built-in file tools and the Context Coder MCP for enhanced codebase analysis. Follow this workflow:

1. ALWAYS start every new chat by calling get_codebase_size and get_codebase MCP tools to ingest and understand the full project context
2. Use Context Coder's codebase analysis as your primary reference - avoid reading files since you already have the complete codebase, only read file if you are missing something or if the user specifically requests it.
${codeEditingText}`,
        },
      });
      break;
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }

  // Add the user's task as a follow-up message if provided
  if (args?.task) {
    messages.push({
      role: 'user',
      content: {
        type: 'text',
        text: args.task,
      },
    });
  }

  return messages;
};
