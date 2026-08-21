import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DEFAULT_PAGE_SIZE, getConfiguredPageSize } from '../constants.js';

describe('getConfiguredPageSize', () => {
  let originalPageSize: string | undefined;

  beforeEach(() => {
    originalPageSize = process.env.COCO_PAGE_SIZE;
  });

  afterEach(() => {
    if (originalPageSize !== undefined) {
      process.env.COCO_PAGE_SIZE = originalPageSize;
    } else {
      delete process.env.COCO_PAGE_SIZE;
    }
  });

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
