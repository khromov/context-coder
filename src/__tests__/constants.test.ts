import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  DEFAULT_PAGE_SIZE,
  getConfiguredPageSize,
  DEFAULT_CLAUDE_CODE_PAGE_SIZE,
  getClaudeCodePageSize,
  DEFAULT_CLAUDE_TOKEN_LIMIT,
  DEFAULT_GPT_TOKEN_LIMIT,
  getClaudeTokenLimit,
  getGptTokenLimit,
  getMode,
  isEditMode,
} from '../constants.js';

// Save the given env vars before each test and restore them after it
function preserveEnv(...names: string[]): void {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of names) {
      saved[name] = process.env[name];
    }
  });

  afterEach(() => {
    for (const name of names) {
      if (saved[name] !== undefined) {
        process.env[name] = saved[name];
      } else {
        delete process.env[name];
      }
    }
  });
}

describe('getConfiguredPageSize', () => {
  preserveEnv('COCO_PAGE_SIZE');

  it('returns the default when COCO_PAGE_SIZE is unset', () => {
    delete process.env.COCO_PAGE_SIZE;
    expect(getConfiguredPageSize()).toBe(DEFAULT_PAGE_SIZE);
  });

  it('returns the configured value when COCO_PAGE_SIZE is a valid number', () => {
    process.env.COCO_PAGE_SIZE = '200000';
    expect(getConfiguredPageSize()).toBe(200000);
  });

  it('falls back to the default for non-numeric values', () => {
    process.env.COCO_PAGE_SIZE = 'not-a-number';
    expect(getConfiguredPageSize()).toBe(DEFAULT_PAGE_SIZE);
  });

  it('falls back to the default for zero or negative values', () => {
    process.env.COCO_PAGE_SIZE = '0';
    expect(getConfiguredPageSize()).toBe(DEFAULT_PAGE_SIZE);

    process.env.COCO_PAGE_SIZE = '-5';
    expect(getConfiguredPageSize()).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe('getClaudeCodePageSize', () => {
  preserveEnv('COCO_CLAUDE_CODE_PAGE_SIZE');

  it('returns the default when COCO_CLAUDE_CODE_PAGE_SIZE is unset', () => {
    delete process.env.COCO_CLAUDE_CODE_PAGE_SIZE;
    expect(getClaudeCodePageSize()).toBe(DEFAULT_CLAUDE_CODE_PAGE_SIZE);
  });

  it('returns the configured value when COCO_CLAUDE_CODE_PAGE_SIZE is a valid number', () => {
    process.env.COCO_CLAUDE_CODE_PAGE_SIZE = '50000';
    expect(getClaudeCodePageSize()).toBe(50000);
  });

  it('falls back to the default for invalid, zero, or negative values', () => {
    process.env.COCO_CLAUDE_CODE_PAGE_SIZE = 'nope';
    expect(getClaudeCodePageSize()).toBe(DEFAULT_CLAUDE_CODE_PAGE_SIZE);

    process.env.COCO_CLAUDE_CODE_PAGE_SIZE = '0';
    expect(getClaudeCodePageSize()).toBe(DEFAULT_CLAUDE_CODE_PAGE_SIZE);

    process.env.COCO_CLAUDE_CODE_PAGE_SIZE = '-1';
    expect(getClaudeCodePageSize()).toBe(DEFAULT_CLAUDE_CODE_PAGE_SIZE);
  });
});

describe('token limits', () => {
  preserveEnv('COCO_CLAUDE_TOKEN_LIMIT', 'COCO_GPT_TOKEN_LIMIT');

  it('returns the defaults when unset', () => {
    delete process.env.COCO_CLAUDE_TOKEN_LIMIT;
    delete process.env.COCO_GPT_TOKEN_LIMIT;
    expect(getClaudeTokenLimit()).toBe(DEFAULT_CLAUDE_TOKEN_LIMIT);
    expect(getGptTokenLimit()).toBe(DEFAULT_GPT_TOKEN_LIMIT);
  });

  it('returns configured values', () => {
    process.env.COCO_CLAUDE_TOKEN_LIMIT = '500000';
    process.env.COCO_GPT_TOKEN_LIMIT = '400000';
    expect(getClaudeTokenLimit()).toBe(500000);
    expect(getGptTokenLimit()).toBe(400000);
  });

  it('falls back to the defaults for invalid, zero, or negative values', () => {
    process.env.COCO_CLAUDE_TOKEN_LIMIT = 'invalid';
    process.env.COCO_GPT_TOKEN_LIMIT = '0';
    expect(getClaudeTokenLimit()).toBe(DEFAULT_CLAUDE_TOKEN_LIMIT);
    expect(getGptTokenLimit()).toBe(DEFAULT_GPT_TOKEN_LIMIT);

    process.env.COCO_CLAUDE_TOKEN_LIMIT = '-10';
    expect(getClaudeTokenLimit()).toBe(DEFAULT_CLAUDE_TOKEN_LIMIT);
  });
});

describe('getMode and isEditMode', () => {
  preserveEnv('CONTEXT_CODER_MODE', 'CONTEXT_CODER_EDIT_MODE');

  it('defaults to full mode without edit_file', () => {
    delete process.env.CONTEXT_CODER_MODE;
    delete process.env.CONTEXT_CODER_EDIT_MODE;
    expect(getMode()).toBe('full');
    expect(isEditMode()).toBe(false);
  });

  it('reads the mode and edit mode set by the CLI', () => {
    process.env.CONTEXT_CODER_MODE = 'mini';
    process.env.CONTEXT_CODER_EDIT_MODE = 'true';
    expect(getMode()).toBe('mini');
    expect(isEditMode()).toBe(true);
  });

  it('treats unknown modes as full', () => {
    process.env.CONTEXT_CODER_MODE = 'something-else';
    expect(getMode()).toBe('full');
  });
});
