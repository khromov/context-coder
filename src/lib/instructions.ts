import type { ServerMode } from '../constants.js';

export interface InstructionsOptions {
  mode: ServerMode;
  editMode: boolean;
}

// Text for the editing placeholders in instructions.md, depending on whether edit_file is enabled
const EDITING_TEXT = {
  edit: {
    toolList: '- `edit_file` - Make exact text replacements in files',
    strategy:
      '**Editing Strategy**: Use `edit_file` for small, targeted changes and `write_file` when rewriting entire files or making extensive changes.',
    practice:
      '**Efficient Editing**: Use `edit_file` for small changes, `write_file` for larger edits',
  },
  write: {
    toolList: '',
    strategy:
      '**Editing Strategy**: Use `write_file` to create or completely overwrite files with new content.',
    practice: '**Efficient Editing**: Use `write_file` for complete file rewrites',
  },
};

function modeBlock(name: string): RegExp {
  return new RegExp(`<!-- ${name} -->([\\s\\S]*?)<!-- /${name} -->`, 'g');
}

/**
 * Fill in instructions.md for the running configuration. Sections wrapped in
 * `<!-- full-mode -->` / `<!-- mini-mode -->` are kept only in that mode (mini mode has no
 * file tools), and the editing placeholders depend on whether edit_file is enabled.
 */
export function processInstructions(
  template: string,
  { mode, editMode }: InstructionsOptions
): string {
  const keptBlock = mode === 'full' ? 'full-mode' : 'mini-mode';
  const droppedBlock = mode === 'full' ? 'mini-mode' : 'full-mode';
  const editing = editMode ? EDITING_TEXT.edit : EDITING_TEXT.write;

  return (
    template
      .replace(modeBlock(droppedBlock), '')
      .replace(modeBlock(keptBlock), '$1')
      .replaceAll('{EDIT_FILE_TOOL_LIST}', editing.toolList)
      .replaceAll('{EDITING_STRATEGY}', editing.strategy)
      .replaceAll('{EFFICIENT_EDITING_PRACTICE}', editing.practice)
      // Removed blocks and empty placeholders leave runs of blank lines behind
      .replace(/\n{3,}/g, '\n\n')
  );
}
