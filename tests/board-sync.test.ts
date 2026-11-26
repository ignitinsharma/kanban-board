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
  expect(state).toHaveBeenLastCalledWith("closed");
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
