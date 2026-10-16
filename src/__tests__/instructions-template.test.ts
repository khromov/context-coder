import { describe, it, expect, beforeAll } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { processInstructions } from '../lib/instructions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('processInstructions', () => {
  const sampleInstructions = `
### 3. Work

Shared text

<!-- full-mode -->
### 4. Modify with Confidence

{EDIT_FILE_TOOL_LIST}
- \`write_file\` - Create or completely overwrite files

{EDITING_STRATEGY}
<!-- /full-mode -->

<!-- mini-mode -->
### 4. Use Your Own Tools
<!-- /mini-mode -->

## Best Practices

<!-- full-mode -->
- {EFFICIENT_EDITING_PRACTICE}
<!-- /full-mode -->
`;

  it('should fill in the edit_file text when edit mode is enabled', () => {
    const result = processInstructions(sampleInstructions, { mode: 'full', editMode: true });

    expect(result).not.toMatch(/\{[A-Z_]+\}/);
    expect(result).toContain('- `edit_file` - Make exact text replacements in files');
    expect(result).toContain('Use `edit_file` for small, targeted changes');
    expect(result).toContain('`write_file` when rewriting entire files');
    expect(result).toContain('### 4. Modify with Confidence');
    expect(result).not.toContain('### 4. Use Your Own Tools');
  });

  it('should leave out edit_file when edit mode is disabled', () => {
    const result = processInstructions(sampleInstructions, { mode: 'full', editMode: false });

    expect(result).not.toMatch(/\{[A-Z_]+\}/);
    expect(result).not.toContain('edit_file');
    expect(result).toContain('Use `write_file` to create or completely overwrite files');
    expect(result).toContain('complete file rewrites');
  });

  it('should keep only the mini-mode sections in mini mode', () => {
    const result = processInstructions(sampleInstructions, { mode: 'mini', editMode: false });

    expect(result).toContain('### 4. Use Your Own Tools');
    expect(result).not.toContain('Modify with Confidence');
    expect(result).not.toContain('write_file');
    expect(result).not.toContain('Efficient Editing');
    expect(result).toContain('Shared text');
  });

  it('should remove the mode markers and collapse leftover blank lines', () => {
    const result = processInstructions(sampleInstructions, { mode: 'full', editMode: false });

    expect(result).not.toContain('<!--');
    expect(result).not.toMatch(/\n{3,}/);
  });

  describe('the real instructions.md', () => {
    let template: string;

    beforeAll(async () => {
      template = await fs.readFile(path.join(__dirname, '..', '..', 'instructions.md'), 'utf-8');
    });

    it.each([
      { mode: 'full' as const, editMode: false },
      { mode: 'full' as const, editMode: true },
      { mode: 'mini' as const, editMode: false },
      { mode: 'mini' as const, editMode: true },
    ])('should leave no placeholders or markers ($mode, edit: $editMode)', (options) => {
      const result = processInstructions(template, options);

      expect(result).not.toMatch(/\{[A-Z_]+\}/);
      expect(result).not.toContain('<!--');
      expect(result).toContain('get_codebase_size');
    });

    it('should only mention the file tools in full mode', () => {
      const full = processInstructions(template, { mode: 'full', editMode: true });
      const mini = processInstructions(template, { mode: 'mini', editMode: true });

      for (const tool of ['read_file', 'write_file', 'edit_file', 'execute_command']) {
        expect(full).toContain(tool);
        expect(mini).not.toContain(tool);
      }
    });

    it('should show ignore patterns as written', () => {
      const result = processInstructions(template, { mode: 'full', editMode: false });

      expect(result).toContain('\n*.min.js\n');
      expect(result).toContain('\n*.csv\n');
      expect(result).toContain('\n*.json\n');
      expect(result).not.toContain('_.csv');
      expect(result).not.toContain('\\*.min.js');
    });
  });
});
