import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { applyBoardEvent } from "../src/shared/apply-board-event";
import type { BoardDetail, Card, Column } from "../src/shared/board";
import type { BoardEvent } from "../src/shared/events";
import { subscribeToBoard } from "../src/features/board/board-subscription";

const ids = Array.from(
  { length: 8 },
  (_, index) => `00000000-0000-4000-8000-00000000000${index}`,
);
const [id, actorId, colId, nextCol, cardId, card2, clientId] = ids;
const t1 = "2026-01-01T00:00:00.000Z";
const t2 = "2026-01-01T00:00:01.000Z";
const timestamps = { createdAt: t1, updatedAt: t1 };
const column: Column = {
  ...timestamps,
  boardId: id,
  id: colId,
  name: "First",
  position: "a0Z",
};
const secondColumn: Column = { ...column, id: nextCol, position: "a0a" };
const card: Card = {
  ...timestamps,
  id: cardId,
  boardId: id,
  columnId: colId,
  title: "Card",
  description: null,
  assigneeId: null,
  priority: "MEDIUM",
  position: "a0a",
};
const board = { ...timestamps, id, ownerId: actorId, name: "Board" };
const detail: BoardDetail = {
  ...board,
  columns: [column, secondColumn],
  cards: [card],
  members: [],
};

function event<T extends BoardEvent["type"]>(
  type: T,
  entity: Extract<BoardEvent, { type: T }>["entity"],
) {
  return {
    type,
    boardId: id,
    actorId,
    originClientId: clientId,
    entity,
  } as BoardEvent;
}

it("applies board updates and deletion, and inserts public members once", () => {
  const renamed = applyBoardEvent(
    detail,
    event("board.updated", { ...board, name: "New", updatedAt: t2 }),
  ).boardDetail!;
  expect(renamed.name).toBe("New");
  expect(renamed.columns).toBe(detail.columns);
  expect(
    applyBoardEvent(renamed, event("board.deleted", { id })).boardDetail,
  ).toBeNull();
  const added = event("member.added", {
    id: actorId,
    name: "Member",
    email: "member@example.com",
  });
  const joined = applyBoardEvent(detail, added).boardDetail!;
  expect(joined.members).toEqual([added.entity]);
  expect(applyBoardEvent(joined, added).boardDetail).toBe(joined);
});

it("creates, updates, moves and deletes columns with ordinal ordering and stale-card cleanup", () => {
  const extra = { ...column, id: ids[7], position: "a0B" };
  const created = applyBoardEvent(
    detail,
    event("column.created", extra),
  ).boardDetail!;
  expect(created.columns.map(({ id }) => id)).toEqual([
    extra.id,
    colId,
    nextCol,
  ]);
  const updated = applyBoardEvent(
    created,
    event("column.updated", { ...column, name: "New", updatedAt: t2 }),
  ).boardDetail!;
  expect(updated.columns[1].name).toBe("New");
  const moved = applyBoardEvent(
    updated,
    event("column.moved", { ...secondColumn, position: "Zz", updatedAt: t2 }),
  ).boardDetail!;
  expect(moved.columns[0].id).toBe(nextCol);
  const deleted = applyBoardEvent(
    moved,
    event("column.deleted", { id: colId }),
  );
  expect(deleted.boardDetail?.cards).toEqual([]);
  expect(deleted.needsRefetch).toBe(true);
});

it("creates, updates, moves and deletes cards and reconciles ambiguous or missing data", () => {
  const added = { ...card, id: card2, position: "a0Z" };
  const created = applyBoardEvent(
    detail,
    event("card.created", added),
  ).boardDetail!;
  expect(created.cards.map(({ id }) => id)).toEqual([card2, cardId]);
  const change = event("card.updated", {
    ...added,
    title: "New",
    updatedAt: t2,
  });
  const updated = applyBoardEvent(created, change).boardDetail!;
  expect(updated.cards[0].title).toBe("New");
  expect(applyBoardEvent(updated, change).boardDetail).toBe(updated);
  expect(
    applyBoardEvent(updated, event("card.created", added)).boardDetail,
  ).toBe(updated);
  expect(
    applyBoardEvent(updated, event("card.updated", { ...added, updatedAt: t2 }))
      .needsRefetch,
  ).toBe(true);
  const move = event("card.moved", {
    ...card,
    id: card2,
    columnId: nextCol,
    updatedAt: t2,
  });
  expect(applyBoardEvent(detail, move).needsRefetch).toBe(true);
  const moved = applyBoardEvent(created, move).boardDetail!;
  expect(moved.cards.map(({ id }) => id)).toEqual([cardId, card2]);
  const remove = event("card.deleted", { id: card2 });
  const deleted = applyBoardEvent(moved, remove).boardDetail!;
  expect(deleted.cards).toEqual([card]);
  expect(applyBoardEvent(deleted, remove).boardDetail).toBe(deleted);
  expect(detail.cards).toEqual([card]);
  expect(
    applyBoardEvent(
      detail,
      event("card.created", { ...added, columnId: ids[7] }),
    ).needsRefetch,
  ).toBe(true);
});

class FakeSource extends EventTarget {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;
  close = vi.fn();

  emit(event: BoardEvent) {
    this.dispatchEvent(
      new MessageEvent(event.type, { data: JSON.stringify(event) }),
    );
  }
}

afterEach(() => vi.unstubAllGlobals());

it("reconciles opens and snapshot races, retains deletion tombstones, and closes on board deletion", async () => {
  const query = new QueryClient();
  const source = new FakeSource();
  const snapshot = () => Response.json(detail);
  const delayed = Promise.withResolvers<Response>();
  const fetch = vi
    .fn()
    .mockImplementationOnce(() => delayed.promise)
    .mockImplementation(async () => snapshot());
  vi.stubGlobal("fetch", fetch);
  const factory = vi.fn(() => source as unknown as EventSource);
  const state = vi.fn();
  const close = subscribeToBoard(query, id, state, factory);
  const key = ["boards", id];
  source.onopen?.();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  source.emit(
    event("card.updated", { ...card, title: "Update", updatedAt: t2 }),
  );
  delayed.resolve(snapshot());
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(query.isFetching()).toBe(0));

  source.emit(event("card.deleted", { id: cardId }));
  await vi.waitFor(() =>
    expect(query.getQueryData<BoardDetail>(key)?.cards).toEqual([]),
  );
  source.emit(event("card.created", card));
  expect(query.getQueryData<BoardDetail>(key)?.cards).toEqual([]);
  expect(factory).toHaveBeenCalledTimes(1);
  source.onopen?.();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  source.emit(event("board.deleted", { id }));
  expect(query.getQueryData(key)).toBeUndefined();
  expect(state).toHaveBeenLastCalledWith("removed");
  expect(source.close).toHaveBeenCalledTimes(1);
  close();
  query.clear();
});

it("unmount closes the source and removes handlers", () => {
  const query = new QueryClient();
  const source = new FakeSource();
  const close = subscribeToBoard(
    query,
    id,
    vi.fn(),
    () => source as unknown as EventSource,
  );
  close();
  expect(source.close).toHaveBeenCalledTimes(1);
  expect(source.onopen).toBeNull();
  expect(source.onerror).toBeNull();
});

function recovery(fetch: ReturnType<typeof vi.fn>) {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetch);
  const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
  const query = new QueryClient();
  query.setQueryData(["boards", id], detail);
  const sources: FakeSource[] = [];
  const state = vi.fn();
  const unauthorized = vi.fn();
  const stop = subscribeToBoard(
    query,
    id,
    state,
    () => {
      const source = new FakeSource();
      sources.push(source);
      return source as unknown as EventSource;
    },
    unauthorized,
  );
  function fail(index = sources.length - 1) {
    sources[index].readyState = 2;
    sources[index].onerror?.();
  }
  function clean() {
    stop();
    query.clear();
    random.mockRestore();
    vi.useRealTimers();
  }
  return { state, sources, fail, stop, clean, query, unauthorized };
}

it("probes a terminal close and opens a new source with the recovered snapshot", async () => {
  const snapshot = { ...detail, name: "Recovered" };
  const fetch = vi.fn().mockResolvedValue(Response.json(snapshot));
  const f = recovery(fetch);
  try {
    f.fail();
    expect(f.state).toHaveBeenLastCalledWith("reconnecting");
    expect(f.sources[0].close).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.query.getQueryData(["boards", id])).toEqual(snapshot);
    expect(f.sources).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "same-origin" }),
    );
  } finally {
    f.clean();
  }
});

it("stops on a 401 and notifies the UI exactly once", async () => {
  const f = recovery(
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  );
  try {
    f.fail();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.state).toHaveBeenLastCalledWith("unauthenticated");
    expect(f.unauthorized).toHaveBeenCalledOnce();
    expect(f.sources).toHaveLength(1);
  } finally {
    f.clean();
  }
});

it("stops on a 404 and removes the board from both caches", async () => {
  const f = recovery(
    vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
  );
  try {
    const other = { ...board, id: ids[7] };
    f.query.setQueryData(["boards"], [board, other]);
    f.fail();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.state).toHaveBeenLastCalledWith("removed");
    expect(f.query.getQueryData(["boards", id])).toBeUndefined();
    expect(f.query.getQueryData(["boards"])).toEqual([other]);
    expect(f.sources).toHaveLength(1);
  } finally {
    f.clean();
  }
});

it("backs off on 429, 503, and network failure with jitter and a 30-second cap", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 429 }))
    .mockRejectedValueOnce(new TypeError("network"))
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  const f = recovery(fetch);
  try {
    f.fail();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    for (const [index, base] of [
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ].entries()) {
      const delay = Math.round(base * 0.9);
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fetch).toHaveBeenCalledTimes(index + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(index + 2);
    }
  } finally {
    f.clean();
  }
});

it("cancels backoff on unmount", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
  const f = recovery(fetch);
  try {
    f.fail();
    await vi.advanceTimersByTimeAsync(0);
    f.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledOnce();
    expect(f.sources).toHaveLength(1);
  } finally {
    f.clean();
  }
});

it("aborts an in-flight probe on unmount", async () => {
  const pending = Promise.withResolvers<Response>();
  const fetch = vi.fn().mockReturnValue(pending.promise);
  const f = recovery(fetch);
  try {
    f.fail();
    await vi.advanceTimersByTimeAsync(0);
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    f.stop();
    expect(signal.aborted).toBe(true);
    pending.resolve(Response.json(detail));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.sources).toHaveLength(1);
  } finally {
    f.clean();
  }
});

it("backs off when a readable board keeps rejecting SSE and resets after open", async () => {
  const fetch = vi.fn().mockImplementation(async () => Response.json(detail));
  const f = recovery(fetch);
  try {
    f.fail();
    await vi.advanceTimersByTimeAsync(0);
    f.fail();
    await vi.advanceTimersByTimeAsync(900);
    f.fail();
    await vi.advanceTimersByTimeAsync(1800);
    expect(f.sources).toHaveLength(4);
    f.sources.at(-1)!.onopen?.();
    await vi.advanceTimersByTimeAsync(0);
    f.fail();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.sources).toHaveLength(5);
    f.fail();
    await vi.advanceTimersByTimeAsync(900);
    expect(f.sources).toHaveLength(6);
  } finally {
    f.clean();
  }
});
