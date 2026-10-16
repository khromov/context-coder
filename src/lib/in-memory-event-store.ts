import type {
  EventStore,
  EventId,
  StreamId,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

interface StoredEvent {
  eventId: EventId;
  streamId: StreamId;
  message: JSONRPCMessage;
  storedAt: number;
}

export interface InMemoryEventStoreOptions {
  /** Most events to keep; the oldest are dropped first. Unlimited by default. */
  maxEvents?: number;
  /** Drop events older than this many milliseconds. Never by default. */
  maxAgeMs?: number;
  /** Clock used for event ages, replaceable in tests. */
  now?: () => number;
}

/**
 * Keeps the events sent on each SSE stream so a client that reconnects with a
 * Last-Event-ID header can be sent what it missed. One store is created per session.
 * Events past maxEvents or maxAgeMs are dropped, so a session that sits idle does not
 * hold large messages (such as get_codebase pages) in memory forever.
 */
export class InMemoryEventStore implements EventStore {
  // Events per stream, in the order they were sent
  private readonly streams = new Map<StreamId, StoredEvent[]>();
  private readonly eventsById = new Map<EventId, StoredEvent>();
  // All events, oldest first, so the oldest can be dropped
  private readonly events: StoredEvent[] = [];
  private nextEventNumber = 0;
  private readonly maxEvents: number;
  private readonly maxAgeMs: number;
  private readonly now: () => number;

  constructor({
    maxEvents = Infinity,
    maxAgeMs = Infinity,
    now = Date.now,
  }: InMemoryEventStoreOptions = {}) {
    this.maxEvents = maxEvents;
    this.maxAgeMs = maxAgeMs;
    this.now = now;
  }

  /** Number of events currently kept. */
  get size(): number {
    return this.events.length;
  }

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    // A counter keeps IDs unique and ordered, even for events stored in the same millisecond
    const eventId = `${streamId}_${this.nextEventNumber++}`;
    const event: StoredEvent = { eventId, streamId, message, storedAt: this.now() };

    let streamEvents = this.streams.get(streamId);
    if (!streamEvents) {
      streamEvents = [];
      this.streams.set(streamId, streamEvents);
    }
    streamEvents.push(event);
    this.eventsById.set(eventId, event);
    this.events.push(event);

    while (this.events.length > this.maxEvents) {
      this.dropOldest();
    }
    this.prune();

    return eventId;
  }

  /** Drop events older than maxAgeMs. Called on every store and periodically by the server. */
  prune(): void {
    const cutoff = this.now() - this.maxAgeMs;
    while (this.events.length > 0 && this.events[0].storedAt < cutoff) {
      this.dropOldest();
    }
  }

  private dropOldest(): void {
    const event = this.events.shift();
    if (!event) {
      return;
    }
    this.eventsById.delete(event.eventId);
    // Events are stored in order, so the oldest event overall is also the oldest in its stream
    const streamEvents = this.streams.get(event.streamId);
    streamEvents?.shift();
    if (streamEvents?.length === 0) {
      this.streams.delete(event.streamId);
    }
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    return this.eventsById.get(eventId)?.streamId;
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> }
  ): Promise<StreamId> {
    const lastEvent = this.eventsById.get(lastEventId);
    if (!lastEvent) {
      return '';
    }

    const streamEvents = this.streams.get(lastEvent.streamId) ?? [];
    const lastIndex = streamEvents.indexOf(lastEvent);
    for (const { eventId, message } of streamEvents.slice(lastIndex + 1)) {
      await send(eventId, message);
    }

    return lastEvent.streamId;
  }
}
