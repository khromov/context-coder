import { describe, it, expect } from '@jest/globals';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryEventStore } from '../lib/in-memory-event-store.js';

const message = (id: number): JSONRPCMessage => ({ jsonrpc: '2.0', id, result: {} });

async function replay(store: InMemoryEventStore, lastEventId: string) {
  const sent: { eventId: string; message: JSONRPCMessage }[] = [];
  const streamId = await store.replayEventsAfter(lastEventId, {
    send: async (eventId, message) => {
      sent.push({ eventId, message });
    },
  });
  return { streamId, sent };
}

describe('InMemoryEventStore', () => {
  it('should replay only later events from the same stream', async () => {
    const store = new InMemoryEventStore();
    const first = await store.storeEvent('stream-a', message(1));
    await store.storeEvent('stream-b', message(2));
    const third = await store.storeEvent('stream-a', message(3));
    const fourth = await store.storeEvent('stream-a', message(4));

    const { streamId, sent } = await replay(store, first);

    expect(streamId).toBe('stream-a');
    expect(sent).toEqual([
      { eventId: third, message: message(3) },
      { eventId: fourth, message: message(4) },
    ]);
  });

  it('should keep the order of events stored in the same millisecond', async () => {
    const store = new InMemoryEventStore();
    const eventIds = await Promise.all(
      Array.from({ length: 50 }, (_, i) => store.storeEvent('stream-a', message(i)))
    );

    const { sent } = await replay(store, eventIds[0]);

    expect(sent.map((event) => event.eventId)).toEqual(eventIds.slice(1));
  });

  it('should map event IDs to their stream', async () => {
    const store = new InMemoryEventStore();
    const eventId = await store.storeEvent('stream-a', message(1));

    expect(await store.getStreamIdForEventId(eventId)).toBe('stream-a');
    expect(await store.getStreamIdForEventId('unknown')).toBeUndefined();
  });

  it('should replay nothing for an unknown event ID', async () => {
    const store = new InMemoryEventStore();
    await store.storeEvent('stream-a', message(1));

    const { streamId, sent } = await replay(store, 'unknown');

    expect(streamId).toBe('');
    expect(sent).toEqual([]);
  });

  describe('limits', () => {
    it('should drop the oldest events beyond maxEvents', async () => {
      const store = new InMemoryEventStore({ maxEvents: 3 });
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push(await store.storeEvent(i % 2 === 0 ? 'stream-a' : 'stream-b', message(i)));
      }

      expect(store.size).toBe(3);
      expect(await store.getStreamIdForEventId(ids[0])).toBeUndefined();
      expect(await store.getStreamIdForEventId(ids[1])).toBeUndefined();
      expect(await store.getStreamIdForEventId(ids[2])).toBe('stream-a');

      // Replay still works for the events that are kept
      const { sent } = await replay(store, ids[2]);
      expect(sent.map((event) => event.eventId)).toEqual([ids[4]]);
    });

    it('should drop events older than maxAgeMs when pruned', async () => {
      let now = 1000;
      const store = new InMemoryEventStore({ maxAgeMs: 500, now: () => now });

      const old = await store.storeEvent('stream-a', message(1));
      now = 1400;
      const recent = await store.storeEvent('stream-a', message(2));

      now = 1600;
      store.prune();

      expect(store.size).toBe(1);
      expect(await store.getStreamIdForEventId(old)).toBeUndefined();
      expect(await store.getStreamIdForEventId(recent)).toBe('stream-a');

      now = 2000;
      store.prune();
      expect(store.size).toBe(0);
    });

    it('should also drop old events when storing new ones', async () => {
      let now = 0;
      const store = new InMemoryEventStore({ maxAgeMs: 100, now: () => now });

      await store.storeEvent('stream-a', message(1));
      now = 500;
      await store.storeEvent('stream-b', message(2));

      expect(store.size).toBe(1);
    });
  });
});
