import { describe, it, expect } from '@jest/globals';
import { CappedOutput } from '../lib/capped-output.js';

describe('CappedOutput', () => {
  it('should return short output unchanged', () => {
    const output = new CappedOutput(10, 10);
    output.push(Buffer.from('hello '));
    output.push(Buffer.from('world'));

    expect(output.toString()).toBe('hello world');
    expect(output.omittedBytes).toBe(0);
  });

  it('should keep output that exactly fills head and tail', () => {
    const output = new CappedOutput(5, 5);
    output.push(Buffer.from('abcdefghij'));

    expect(output.toString()).toBe('abcdefghij');
  });

  it('should keep the start and end of long output and count what was dropped', () => {
    const output = new CappedOutput(5, 5);
    output.push(Buffer.from('START'));
    for (let i = 0; i < 100; i++) {
      output.push(Buffer.from('xxxxxxxxxx'));
    }
    output.push(Buffer.from('..END'));

    expect(output.omittedBytes).toBe(1000);
    expect(output.toString()).toBe('START\n[... 1,000 bytes omitted ...]\n..END');
  });

  it('should take the tail from inside a single large chunk', () => {
    const output = new CappedOutput(3, 3);
    output.push(Buffer.from('abc' + 'x'.repeat(50) + 'xyz'));

    expect(output.toString()).toBe('abc\n[... 50 bytes omitted ...]\nxyz');
  });

  it('should keep multi-byte characters intact when nothing is omitted', () => {
    const output = new CappedOutput(4, 10);
    // '世' is 3 bytes, so the head limit splits the second character
    output.push(Buffer.from('世界'));

    expect(output.toString()).toBe('世界');
  });
});
