import { EditFileArgsSchema } from '../schemas.js';
import type { HandlerContext, HandlerResponse, ToolInput } from '../types.js';
import { validateRelativePath, resolveRelativePath, formatDisplayPath } from './utils.js';
import fs from 'fs/promises';
import logger from '../logger.js';

export async function handleEditFile(
  args: ToolInput,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('✏️ edit_file handler started');

  const parsed = EditFileArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for edit_file: ${parsed.error}`);
  }
  validateRelativePath(parsed.data.path);
  const absolutePath = resolveRelativePath(parsed.data.path, context.absoluteRootDir);

  try {
    const originalContent = await fs.readFile(absolutePath, 'utf-8');
    const result = await applyFileEdits(
      originalContent,
      parsed.data.edits,
      parsed.data.dryRun,
      parsed.data.replaceAll
    );

    if (parsed.data.dryRun) {
      const displayPath = formatDisplayPath(parsed.data.path);
      return {
        content: [
          {
            type: 'text',
            text: `Dry run preview for ${displayPath}:\n\n${result.diff}`,
          },
        ],
      };
    }

    if (!result.success) {
      throw new Error(result.error || 'Unknown error occurred during file editing');
    }

    if (!result.content) {
      throw new Error('No content returned from edit operation');
    }

    await fs.writeFile(absolutePath, result.content);
    const displayPath = formatDisplayPath(parsed.data.path);

    const response: HandlerResponse = {
      content: [
        {
          type: 'text',
          text: `Successfully applied ${parsed.data.edits.length} edit(s) to ${displayPath}`,
        },
      ],
    };

    logger.debug(
      `⏱️ edit_file handler finished for path: ${parsed.data.path}, edits applied: ${parsed.data.edits.length}`
    );
    return response;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File not found: ${formatDisplayPath(parsed.data.path)}`);
    }
    throw error;
  }
}

interface EditResult {
  success: boolean;
  content?: string;
  diff?: string;
  error?: string;
}

async function applyFileEdits(
  originalContent: string,
  edits: Array<{ oldText: string; newText: string }>,
  dryRun: boolean = false,
  replaceAll: boolean = false
): Promise<EditResult> {
  let content = originalContent;
  const changes: Array<{ oldText: string; newText: string; applied: boolean }> = [];

  for (const edit of edits) {
    const { oldText, newText } = edit;

    if (!content.includes(oldText)) {
      return {
        success: false,
        error: `Text not found in file: "${oldText.substring(0, 100)}${oldText.length > 100 ? '...' : ''}"`,
      };
    }

    const occurrences = (content.match(new RegExp(escapeRegExp(oldText), 'g')) || []).length;
    if (occurrences > 1 && !replaceAll) {
      return {
        success: false,
        error: `Found ${occurrences} matches of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true. To replace only one occurrence, please provide more context to uniquely identify the instance.`,
      };
    }

    if (!dryRun) {
      content = replaceAll
        ? content.replaceAll(oldText, newText)
        : content.replace(oldText, newText);
    }
    changes.push({ oldText, newText, applied: !dryRun });
  }

  if (dryRun) {
    const diff = generateDiff(originalContent, content, changes);
    return {
      success: true,
      diff,
    };
  }

  return {
    success: true,
    content,
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateDiff(
  original: string,
  modified: string,
  changes: Array<{ oldText: string; newText: string; applied: boolean }>
): string {
  let diff = '';

  for (const change of changes) {
    const { oldText, newText } = change;
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');

    diff += `@@ Edit: Replace ${oldLines.length} line(s) with ${newLines.length} line(s) @@\n`;

    for (const line of oldLines) {
      diff += `-${line}\n`;
    }

    for (const line of newLines) {
      diff += `+${line}\n`;
    }

    diff += '\n';
  }

  return diff.trim();
}
