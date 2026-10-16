import { EditFileArgsSchema } from '../schemas.js';
import { HandlerContext, HandlerResponse } from '../types.js';
import { resolveSafePath, formatDisplayPath } from './utils.js';
import { normalizeLineEndings, writeFileSecure } from '../file-operations.js';
import fs from 'fs/promises';
import logger from '../logger.js';

interface TextEdit {
  oldText: string;
  newText: string;
}

export async function handleEditFile(
  args: unknown,
  context: HandlerContext
): Promise<HandlerResponse> {
  logger.debug('✏️ edit_file handler started');

  const parsed = EditFileArgsSchema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments for edit_file: ${parsed.error}`);
  }
  const { path: relativePath, edits, dryRun, replaceAll } = parsed.data;
  const absolutePath = await resolveSafePath(relativePath, context.absoluteRootDir);
  const displayPath = formatDisplayPath(relativePath);

  let originalContent: string;
  try {
    originalContent = await fs.readFile(absolutePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File not found: ${displayPath}`);
    }
    throw error;
  }

  // Dry runs apply the edits too, so they report exactly what a real edit would do
  const content = applyFileEdits(originalContent, edits, replaceAll);

  if (dryRun) {
    return {
      content: [
        {
          type: 'text',
          text: `Dry run preview for ${displayPath}:\n\n${generateDiff(edits)}`,
        },
      ],
    };
  }

  await writeFileSecure(absolutePath, content);

  logger.debug(
    `⏱️ edit_file handler finished for path: ${relativePath}, edits applied: ${edits.length}`
  );
  return {
    content: [
      {
        type: 'text',
        text: `Successfully applied ${edits.length} edit(s) to ${displayPath}`,
      },
    ],
  };
}

/**
 * Apply the edits in order and return the new content.
 * @throws If an oldText is not found, or matches more than once without replaceAll
 */
function applyFileEdits(originalContent: string, edits: TextEdit[], replaceAll: boolean): string {
  let content = originalContent;

  for (const edit of edits) {
    const { oldText, newText } = matchLineEndings(content, edit);
    const occurrences = content.split(oldText).length - 1;

    if (occurrences === 0) {
      const preview = edit.oldText.substring(0, 100);
      throw new Error(
        `Text not found in file: "${preview}${edit.oldText.length > 100 ? '...' : ''}"`
      );
    }

    if (occurrences > 1 && !replaceAll) {
      throw new Error(
        `Found ${occurrences} matches of the string to replace, but replaceAll is false. To replace all occurrences, set replaceAll to true. To replace only one occurrence, please provide more context to uniquely identify the instance.`
      );
    }

    // Insert newText literally. A plain replacement string would expand patterns such as
    // $& (the match), $' (the rest of the file) and $$ (a single $).
    content = replaceAll
      ? content.split(oldText).join(newText)
      : content.replace(oldText, () => newText);
  }

  return content;
}

/**
 * Models send text with \n line endings. When the file uses CRLF, convert the edit to CRLF
 * so it matches and keeps the file's line endings. In a file with mixed line endings, the
 * edit is used as written if it matches, and in CRLF form otherwise.
 */
function matchLineEndings(content: string, edit: TextEdit): TextEdit {
  if (!content.includes('\r\n')) {
    return edit;
  }

  const toCrlf = (text: string) => normalizeLineEndings(text).replace(/\n/g, '\r\n');
  const crlfEdit = { oldText: toCrlf(edit.oldText), newText: toCrlf(edit.newText) };

  const hasLoneLf = /(^|[^\r])\n/.test(content);
  if (!hasLoneLf) {
    return crlfEdit;
  }
  return content.includes(edit.oldText) ? edit : crlfEdit;
}

function generateDiff(edits: TextEdit[]): string {
  let diff = '';

  for (const { oldText, newText } of edits) {
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
