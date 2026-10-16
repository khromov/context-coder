import { describe, it, expect } from '@jest/globals';
import { renameWithRetry } from '../file-operations.js';

const errorWithCode = (code: string) => Object.assign(new Error(code), { code });

describe('renameWithRetry', () => {
  it('should retry lock errors until the rename succeeds', async () => {
    let attempts = 0;
    const rename = async () => {
      attempts++;
      if (attempts < 3) {
        throw errorWithCode('EPERM');
      }
    };

    await renameWithRetry('from', 'to', { retry: true, rename });

    expect(attempts).toBe(3);
  });

  it('should give up after the timeout', async () => {
    let attempts = 0;
    const rename = async () => {
      attempts++;
      throw errorWithCode('EBUSY');
    };

    await expect(
      renameWithRetry('from', 'to', { retry: true, timeoutMs: 50, rename })
    ).rejects.toThrow('EBUSY');
    expect(attempts).toBeGreaterThan(1);
  });

  it('should not retry errors other than locks', async () => {
    let attempts = 0;
    const rename = async () => {
      attempts++;
      throw errorWithCode('ENOENT');
    };

    await expect(renameWithRetry('from', 'to', { retry: true, rename })).rejects.toThrow('ENOENT');
    expect(attempts).toBe(1);
  });

  it('should not retry when retrying is off (the default outside Windows)', async () => {
    let attempts = 0;
    const rename = async () => {
      attempts++;
      throw errorWithCode('EPERM');
    };

    await expect(renameWithRetry('from', 'to', { retry: false, rename })).rejects.toThrow('EPERM');
    expect(attempts).toBe(1);
  });
});
