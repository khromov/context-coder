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
});
