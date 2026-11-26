import { afterEach, expect, it, vi } from "vitest";
import { StreamAdmission } from "../src/server/realtime/admission";
import { MemoryEventBus } from "../src/server/realtime/event-bus";
import { boardEventStream } from "../src/server/realtime/sse";
import type { BoardEvent } from "../src/shared/events";

const event: BoardEvent = {
  type: "card.deleted",
  boardId: "board",
  actorId: "actor",
  originClientId: null,
  entity: { id: "card" },
};

function fixture(lifetime = 3_600_000) {
  vi.useFakeTimers();
  const abort = new AbortController();
  const events = new MemoryEventBus<BoardEvent>();
  const subscribe = events.subscribe.bind(events);
  const unsubscribed = vi.fn();
  vi.spyOn(events, "subscribe").mockImplementation((id, listener) => {
    const remove = subscribe(id, listener);
    return () => {
      remove();
      unsubscribed();
    };
  });
  const release = vi.fn();
  const authorize = vi.fn().mockResolvedValue(undefined);
  const reader = boardEventStream({
    boardId: event.boardId,
    events,
    signal: abort.signal,
    release,
    authorize,
    expiresAt: Date.now() + lifetime,
  }).getReader();
  return { abort, events, unsubscribed, release, authorize, reader };
}

afterEach(() => vi.useRealTimers());

it("sends heartbeats and abort clears all timers, listeners and capacity", async () => {
  const { abort, release, reader, unsubscribed, events, authorize } = fixture();
  const decode = new TextDecoder();
  expect(decode.decode((await reader.read()).value)).toContain(": connected");
  await events.publish("other", event);
  expect(authorize).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(decode.decode((await reader.read()).value)).toBe(": heartbeat\n\n");
  abort.abort();
  expect((await reader.read()).done).toBe(true);
  expect(unsubscribed).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("reader cancellation cleans up and discards in-flight authorization", async () => {
  const { reader, events, authorize, release, unsubscribed } = fixture();
  const pending = Promise.withResolvers<void>();
  authorize.mockReturnValueOnce(pending.promise);
  await events.publish(event.boardId, event);
  await reader.cancel();
  pending.resolve();
  expect((await reader.read()).done).toBe(true);
  expect(unsubscribed).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("ends on verified expiry, rotation, or periodic membership failure", async () => {
  const expiring = fixture(1000);
  await expiring.reader.read();
  await vi.advanceTimersByTimeAsync(1000);
  expect((await expiring.reader.read()).done).toBe(true);
  const rotated = fixture();
  await vi.advanceTimersByTimeAsync(55 * 60_000);
  expect(rotated.release).toHaveBeenCalledTimes(1);
  await rotated.reader.cancel();
  const revoked = fixture();
  revoked.authorize.mockRejectedValueOnce(new Error("revoked"));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(revoked.release).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds the backlog while awaiting authorization", async () => {
  const { events, authorize, release, reader } = fixture();
  const pending = Promise.withResolvers<void>();
  authorize.mockReturnValue(pending.promise);
  for (let index = 0; index < 17; index += 1)
    await events.publish(event.boardId, event);
  expect(release).toHaveBeenCalledTimes(1);
  pending.resolve();
  await reader.cancel();
});

it("caps streams per user and process, and reuses slots", () => {
  const admission = new StreamAdmission(1, 2);
  const release = admission.acquire("one")!;
  expect(admission.acquire("one")).toBeNull();
  const other = admission.acquire("two")!;
  expect(admission.acquire("three")).toBeNull();
  release();
  release();
  expect(admission.acquire("three")).toBeTypeOf("function");
  expect(admission.acquire("four")).toBeNull();
  other();
});
