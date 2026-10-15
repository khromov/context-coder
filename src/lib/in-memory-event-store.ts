import type {
  EventStore,
  EventId,
  StreamId,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

interface StoredEvent {
  eventId: EventId;
  message: JSONRPCMessage;
}

/**
 * Keeps the events sent on each SSE stream so a client that reconnects with a
 * Last-Event-ID header can be sent what it missed. One store is created per session.
 */
export class InMemoryEventStore implements EventStore {
  // Events per stream, in the order they were sent
  private readonly streams = new Map<StreamId, StoredEvent[]>();
  private readonly streamIdsByEventId = new Map<EventId, StreamId>();
  private nextEventNumber = 0;

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    // A counter keeps IDs unique and ordered, even for events stored in the same millisecond
    const eventId = `${streamId}_${this.nextEventNumber++}`;

    let events = this.streams.get(streamId);
    if (!events) {
      events = [];
      this.streams.set(streamId, events);
    }
    events.push({ eventId, message });
    this.streamIdsByEventId.set(eventId, streamId);

    return eventId;
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    return this.streamIdsByEventId.get(eventId);
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> }
  ): Promise<StreamId> {
    const streamId = this.streamIdsByEventId.get(lastEventId);
    if (!streamId) {
      return '';
    }

    const events = this.streams.get(streamId) ?? [];
    const lastIndex = events.findIndex((event) => event.eventId === lastEventId);
    for (const { eventId, message } of events.slice(lastIndex + 1)) {
      await send(eventId, message);
    }

    return streamId;
  }
}
