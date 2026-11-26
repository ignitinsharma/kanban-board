import type { BoardEvent } from "@/shared/events";

type Listener<Event> = (event: Event) => void | Promise<void>;

export interface EventBus<Event> {
  publish(boardId: string, event: Event): Promise<void>;
  subscribe(boardId: string, listener: Listener<Event>): () => void;
}

export class MemoryEventBus<Event> implements EventBus<Event> {
  private readonly listeners = new Map<string, Set<Listener<Event>>>();

  async publish(boardId: string, event: Event) {
    const listeners = [...(this.listeners.get(boardId) ?? [])];
    const results = await Promise.allSettled(
      listeners.map(async (listener) => listener(event)),
    );
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (failures.length)
      throw new AggregateError(failures, "Board event delivery failed");
  }

  subscribe(boardId: string, listener: Listener<Event>) {
    const listeners = this.listeners.get(boardId) ?? new Set<Listener<Event>>();
    const subscription: Listener<Event> = (event) => listener(event);
    listeners.add(subscription);
    this.listeners.set(boardId, listeners);

    return () => {
      listeners.delete(subscription);
      if (listeners.size === 0 && this.listeners.get(boardId) === listeners) {
        this.listeners.delete(boardId);
      }
    };
  }
}

const processBus = globalThis as typeof globalThis & {
  kanbanBoardEvents?: EventBus<BoardEvent>;
};

export const boardEvents = (processBus.kanbanBoardEvents ??=
  new MemoryEventBus<BoardEvent>());
