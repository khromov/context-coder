/**
 * Collects a stream's output with bounded memory: the first `headLimit` bytes and the last
 * `tailLimit` bytes are kept, and everything in between is counted but dropped.
 */
export class CappedOutput {
  private readonly head: Buffer[] = [];
  private headBytes = 0;
  private readonly tail: Buffer[] = [];
  private tailBytes = 0;
  private totalBytes = 0;

  constructor(
    private readonly headLimit: number,
    private readonly tailLimit: number
  ) {}

  push(chunk: Buffer): void {
    this.totalBytes += chunk.length;

    let rest = chunk;
    if (this.headBytes < this.headLimit) {
      const take = Math.min(rest.length, this.headLimit - this.headBytes);
      this.head.push(rest.subarray(0, take));
      this.headBytes += take;
      rest = rest.subarray(take);
    }
    if (rest.length === 0) {
      return;
    }

    this.tail.push(rest);
    this.tailBytes += rest.length;
    // Drop whole chunks from the front while the remaining ones still cover the tail limit
    while (this.tail.length > 1 && this.tailBytes - this.tail[0].length >= this.tailLimit) {
      this.tailBytes -= this.tail.shift()!.length;
    }
  }

  /** Number of bytes received but not kept. */
  get omittedBytes(): number {
    return this.totalBytes - this.headBytes - Math.min(this.tailBytes, this.tailLimit);
  }

  toString(): string {
    if (this.omittedBytes === 0) {
      // Decode head and tail together so a character split between them stays intact
      return Buffer.concat([...this.head, ...this.tail]).toString('utf-8');
    }

    const head = Buffer.concat(this.head).toString('utf-8');
    const tailBuffer = Buffer.concat(this.tail);
    const tail = tailBuffer.subarray(tailBuffer.length - this.tailLimit).toString('utf-8');
    return `${head}\n[... ${this.omittedBytes.toLocaleString('en-US')} bytes omitted ...]\n${tail}`;
  }
}
