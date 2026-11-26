import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { BoardDetail, Card } from "../src/shared/board";
import { applyBoardEvent } from "../src/shared/apply-board-event";
import { ApiError } from "../src/lib/api-client";
import { mutationEvent } from "../src/features/board/apply-mutation";
import {
  applyOptimisticMove,
  buildItems,
  cardSlot,
  computeDrop,
  isNoop,
  moveInPreview,
  optimisticPosition,
  prepareMove,
  rebuildPreview,
  revertMove,
} from "../src/features/board/drag-logic";
import { commitCardMove } from "../src/features/board/move-card";

const date = "2026-01-01T00:00:00.000Z";
const later = "2026-01-01T00:00:01.000Z";
const time = { createdAt: date, updatedAt: date };
const boardId = "board";
function card(id: string, columnId: string, position: string): Card {
  return {
    ...time,
    id,
    boardId,
    columnId,
    position,
    title: id,
    priority: "LOW",
    description: null,
    assigneeId: null,
  };
}
const active = card("active", "one", "a0");
const left = card("left", "two", "a0Z");
const right = card("right", "two", "a0a");
const board: BoardDetail = {
  ...time,
  id: boardId,
  name: "Board",
  ownerId: "owner",
  members: [],
  columns: [
    { ...time, boardId, id: "two", name: "Second", position: "a0a" },
    { ...time, boardId, id: "one", name: "First", position: "a0Z" },
    { ...time, boardId, id: "empty", name: "Empty", position: "a1" },
  ],
  cards: [right, active, left],
};
const drop = { columnId: "two", previousId: "left", nextId: "right" };
const key = ["boards", boardId];

it("builds ordered items and computes exact neighbor IDs for start, middle, end and empty drops", () => {
  const items = buildItems(board);
  expect(Object.keys(items)).toEqual(["one", "two", "empty"]);
  expect(items).toEqual({ one: ["active"], two: ["left", "right"], empty: [] });
  expect(
    computeDrop(moveInPreview(items, "active", "two", 0), "active"),
  ).toEqual({ columnId: "two", previousId: null, nextId: "left" });
  expect(
    computeDrop(moveInPreview(items, "active", "two", 1), "active"),
  ).toEqual(drop);
  expect(
    computeDrop(moveInPreview(items, "active", "two", 99), "active"),
  ).toEqual({ columnId: "two", previousId: "right", nextId: null });
  expect(
    computeDrop(moveInPreview(items, "active", "empty", 0), "active"),
  ).toEqual({ columnId: "empty", previousId: null, nextId: null });
  expect(cardSlot(items, "missing")).toBeNull();
  expect(computeDrop(items, "missing")).toBeNull();
});

it("keeps no-op preview references and reorders within a column", () => {
  const items = buildItems(board);
  expect(moveInPreview(items, "active", "one", 0)).toBe(items);
  expect(moveInPreview(items, "x", "one", 0)).toBe(items);
  expect(moveInPreview(items, "active", "missing", 1)).toBe(items);
  const same = computeDrop(items, "active")!;
  expect(isNoop(same, same)).toBe(true);
  expect(isNoop(same, drop)).toBe(false);
  const reordered = moveInPreview(items, "right", "two", 0);
  expect(reordered.two).toEqual(["right", "left"]);
  expect(reordered.one).toBe(items.one);
});

it("rebases the preview after a neighbor or active card moves remotely and cancels on deletion", () => {
  const preview = moveInPreview(buildItems(board), active.id, "two", 1);
  const moved = {
    ...board,
    cards: [
      right,
      { ...active, columnId: "empty" },
      { ...left, columnId: "one", position: "a1" },
    ],
  };
  const rebased = rebuildPreview(preview, buildItems(moved), active.id)!;
  expect(rebased.two).toEqual(["active", "right"]);
  expect(rebased.empty).toEqual([]);
  expect(
    rebuildPreview(
      preview,
      buildItems({ ...board, cards: [left, right] }),
      active.id,
    ),
  ).toBeNull();
  expect(
    rebuildPreview(
      preview,
      buildItems({
        ...board,
        columns: board.columns.filter(({ id }) => id !== "two"),
      }),
      active.id,
    ),
  ).toBeNull();
});

it("uses a byte-wise key between mixed-case positions and rejects stale neighbors", () => {
  const position = optimisticPosition("a0Z", "a0a")!;
  expect(position > "a0Z" && position < "a0a").toBe(true);
  expect(optimisticPosition("a0a", "a0Z")).toBeNull();
  expect(optimisticPosition("a0Z", "a0Z")).toBeNull();
  expect(optimisticPosition(null, "a0Z")! < "a0Z").toBe(true);
  expect(optimisticPosition("a0a", null)! > "a0a").toBe(true);
  expect(
    prepareMove(board, active.id, { ...drop, nextId: "missing" }),
  ).toBeNull();
  expect(
    prepareMove(board, active.id, { ...drop, previousId: null }),
  ).toBeNull();
});

it("optimistically keeps the timestamp and conditionally rolls back only ordering fields", () => {
  const snapshot = prepareMove(board, active.id, drop)!;
  const pending = applyOptimisticMove(
    board,
    active.id,
    "two",
    snapshot.optimistic.position,
  );
  expect(pending.cards.map(({ id }) => id)).toEqual([
    "left",
    "active",
    "right",
  ]);
  expect(pending.cards[1].updatedAt).toBe(date);
  const changedTitle = {
    ...pending,
    cards: pending.cards.map((card) =>
      card.id === active.id ? { ...card, title: "Changed" } : card,
    ),
  };
  expect(
    revertMove(changedTitle, snapshot).cards.find(({ id }) => id === active.id),
  ).toEqual({ ...active, title: "Changed" });
  const movedAgain = applyOptimisticMove(pending, active.id, "empty", "a0");
  expect(revertMove(movedAgain, snapshot)).toBe(movedAgain);
  const newer = {
    ...pending,
    cards: pending.cards.map((card) =>
      card.id === active.id ? { ...card, updatedAt: later } : card,
    ),
  };
  expect(revertMove(newer, snapshot)).toBe(newer);
  const deleted = {
    ...pending,
    cards: pending.cards.filter(({ id }) => id !== active.id),
  };
  expect(revertMove(deleted, snapshot)).toBe(deleted);
});

function fixture() {
  const query = new QueryClient();
  query.setQueryData(key, board);
  const get = () => query.getQueryData<BoardDetail>(key)!;
  const result = {
    ...active,
    columnId: "two",
    position: optimisticPosition("a0Z", "a0a")!,
    updatedAt: later,
  };
  const event = mutationEvent(boardId, "owner", "tab", {
    type: "card.moved",
    entity: result,
  });
  const echo = () => {
    const current = get();
    const next = applyBoardEvent(current, event).boardDetail!;
    if (next !== current) query.setQueryData(key, next);
    return get();
  };
  return { query, get, result, echo };
}

it("applies one optimistic write and preserves the confirmed reference when the echo arrives first", async () => {
  const { query, get, result, echo } = fixture();
  const prepared = vi.fn();
  const start = query.getQueryState(key)!.dataUpdateCount;
  let confirmed: BoardDetail;
  await commitCardMove(
    query,
    boardId,
    "owner",
    { id: active.id, drop, onPrepared: prepared },
    async () => {
      expect(prepared).toHaveBeenCalledOnce();
      expect(query.getQueryState(key)!.dataUpdateCount - start).toBe(1);
      expect(get().cards.find(({ id }) => id === active.id)?.updatedAt).toBe(
        date,
      );
      confirmed = echo();
      return result;
    },
  );
  expect(get()).toBe(confirmed!);
  expect(query.getQueryState(key)!.dataUpdateCount - start).toBe(2);
  query.clear();
});

it("preserves the confirmed reference when the response arrives before the echo", async () => {
  const { query, get, result, echo } = fixture();
  await commitCardMove(
    query,
    boardId,
    "owner",
    { id: active.id, drop },
    async () => result,
  );
  const confirmed = get();
  expect(echo()).toBe(confirmed);
  query.clear();
});

it("rolls back a stale move without restoring a removed neighbor and refetches", async () => {
  const { query, get } = fixture();
  const refetch = vi.spyOn(query, "invalidateQueries");
  const prepared = vi.fn();
  await expect(
    commitCardMove(
      query,
      boardId,
      "owner",
      { id: active.id, drop, onPrepared: prepared },
      async () => {
        query.setQueryData(key, {
          ...get(),
          cards: get().cards.filter(({ id }) => id !== right.id),
        });
        throw new ApiError(409, "STALE_ORDER", "Stale");
      },
    ),
  ).rejects.toMatchObject({ code: "STALE_ORDER" });
  expect(get().cards.find(({ id }) => id === active.id)).toEqual(active);
  expect(get().cards.some(({ id }) => id === right.id)).toBe(false);
  expect(refetch).toHaveBeenCalledOnce();
  expect(prepared).toHaveBeenCalledOnce();
  query.clear();
});

it("rolls back a network error and reconciles ambiguous server outcomes", async () => {
  const { query, get } = fixture();
  const refetch = vi.spyOn(query, "invalidateQueries");
  await expect(
    commitCardMove(
      query,
      boardId,
      "owner",
      { id: active.id, drop },
      async () => {
        throw new TypeError("Network error");
      },
    ),
  ).rejects.toThrow("Network error");
  expect(get().cards.find(({ id }) => id === active.id)).toEqual(active);
  expect(refetch).toHaveBeenCalledOnce();
  query.clear();
});

it("skips the write and request when the destination is already stale", async () => {
  const { query, get } = fixture();
  const request = vi.fn();
  const prepared = vi.fn();
  const original = get();
  await expect(
    commitCardMove(
      query,
      boardId,
      "owner",
      {
        id: active.id,
        drop: { ...drop, nextId: "missing" },
        onPrepared: prepared,
      },
      request,
    ),
  ).rejects.toMatchObject({ code: "STALE_ORDER" });
  expect(request).not.toHaveBeenCalled();
  expect(prepared).toHaveBeenCalledOnce();
  expect(get()).toBe(original);
  query.clear();
});

it("preserves a newer remote move when a pending request later fails", async () => {
  const { query, get } = fixture();
  const wait = Promise.withResolvers<Card>();
  const prepared = Promise.withResolvers<void>();
  const pending = commitCardMove(
    query,
    boardId,
    "owner",
    {
      id: active.id,
      drop,
      onPrepared: prepared.resolve,
    },
    () => wait.promise,
  );
  const failure = expect(pending).rejects.toMatchObject({ status: 422 });
  await prepared.promise;
  const remote = {
    ...active,
    columnId: "empty",
    position: "a0",
    updatedAt: later,
  };
  const incoming = mutationEvent(boardId, "other", "other-tab", {
    type: "card.moved",
    entity: remote,
  });
  query.setQueryData(key, applyBoardEvent(get(), incoming).boardDetail);
  const confirmed = get();
  wait.reject(new ApiError(422, "INVALID_COLUMN", "Unavailable"));
  await failure;
  expect(get()).toBe(confirmed);
  expect(get().cards.find(({ id }) => id === active.id)).toEqual(remote);
  query.clear();
});
