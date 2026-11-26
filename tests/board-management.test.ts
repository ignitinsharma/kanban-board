import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import {
  applyMutation,
  deleteCardResult,
  mutationEvent,
  type BoardMutation,
} from "../src/features/board/apply-mutation";
import { cardDiff } from "../src/features/board/card-diff";
import {
  isEmptyComposer,
  parseComposer,
} from "../src/features/board/composer-validation";
import { ApiError } from "../src/lib/api-client";
import { applyBoardEvent } from "../src/shared/apply-board-event";
import type { BoardDetail, Card } from "../src/shared/board";

const boardId = "board";
const actorId = "owner";
const origin = "tab";
const originalTime = "2026-01-01T00:00:00.000Z";
const changedTime = "2026-01-01T00:00:01.000Z";
const memberId = "21ad2cee-6d42-44b0-bb5c-53579caf66f3";
const column = {
  id: "col",
  boardId,
  position: "a0",
  name: "Backlog",
  createdAt: originalTime,
  updatedAt: originalTime,
};
const card: Card = {
  id: "card",
  boardId,
  columnId: column.id,
  position: "a0",
  title: "Draft",
  description: null,
  priority: "MEDIUM",
  assigneeId: null,
  createdAt: originalTime,
  updatedAt: originalTime,
};
const detail: BoardDetail = {
  id: boardId,
  ownerId: actorId,
  name: "Board",
  createdAt: originalTime,
  updatedAt: originalTime,
  columns: [column],
  cards: [card],
  members: [],
};
const key = ["boards", boardId];
const values = {
  title: "Draft",
  description: "",
  priority: "MEDIUM",
  assigneeId: "",
};

it("sends only changed fields after normalizing editor input", () => {
  expect(
    cardDiff(card, { ...values, title: " Draft ", description: " \t\u0000" }),
  ).toEqual({ success: true, data: {} });
  expect(
    cardDiff(card, {
      ...values,
      title: "Edited",
      priority: "HIGH",
      description: " details ",
      assigneeId: memberId,
    }),
  ).toEqual({
    success: true,
    data: {
      title: "Edited",
      priority: "HIGH",
      description: "details",
      assigneeId: memberId,
    },
  });
  expect(
    cardDiff(
      { ...card, description: "Existing", assigneeId: memberId },
      values,
    ),
  ).toEqual({
    success: true,
    data: { description: null, assigneeId: null },
  });
  expect(
    cardDiff(card, { ...values, description: "a".repeat(5001) }).success,
  ).toBe(false);
  expect(cardDiff(card, { ...values, priority: "UNKNOWN" }).success).toBe(
    false,
  );
});

it("normalizes composer input, checks emptiness and enforces field limits", () => {
  expect(isEmptyComposer(" \u0000 \n ")).toBe(true);
  expect(isEmptyComposer("Text")).toBe(false);
  expect(parseComposer("  Re\u0301view\ncopy  ", "card")).toEqual({
    value: "Réview copy",
  });
  expect(parseComposer("a".repeat(200), "card")).toHaveProperty("value");
  expect(parseComposer("a".repeat(201), "card")).toHaveProperty("error");
  expect(parseComposer("  Board work  ", "column")).toEqual({
    value: "Board work",
  });
  expect(parseComposer("a".repeat(100), "column")).toHaveProperty("value");
  expect(parseComposer("a".repeat(101), "column")).toHaveProperty("error");
  expect(parseComposer(" ", "column")).toHaveProperty("error");
});

const mutations: BoardMutation[] = [
  { type: "card.created", entity: { ...card, id: "new-card", position: "a1" } },
  {
    type: "card.updated",
    entity: { ...card, title: "Updated", updatedAt: changedTime },
  },
  { type: "card.deleted", entity: { id: card.id } },
  {
    type: "column.created",
    entity: { ...column, id: "new-column", position: "a1" },
  },
  {
    type: "column.updated",
    entity: { ...column, name: "New name", updatedAt: changedTime },
  },
  { type: "column.deleted", entity: { id: column.id } },
  {
    type: "member.added",
    entity: { id: memberId, name: "Member", email: "member@example.com" },
  },
];

it.each(mutations)(
  "applies $type once and preserves the cache reference on SSE echo",
  async (mutation) => {
    const initial =
      mutation.type === "column.deleted" ? { ...detail, cards: [] } : detail;
    const query = new QueryClient();
    query.setQueryData(key, initial);
    await applyMutation(query, boardId, actorId, mutation, origin);
    const patched = query.getQueryData<BoardDetail>(key)!;
    expect(patched).not.toBe(initial);
    const event = mutationEvent(boardId, actorId, origin, mutation);
    const { boardDetail, needsRefetch } = applyBoardEvent(patched, event);
    expect(needsRefetch).toBe(false);
    expect(boardDetail).toBe(patched);
    query.clear();
  },
);

it("cancels a stale board query before applying the mutation response", async () => {
  const query = new QueryClient();
  query.setQueryData(key, detail);
  const stale = Promise.withResolvers<BoardDetail>();
  const active = query
    .fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) => {
        signal.addEventListener("abort", () => stale.resolve(detail), {
          once: true,
        });
        return stale.promise;
      },
    })
    .catch(() => undefined);
  await applyMutation(query, boardId, actorId, mutations[1], origin);
  await active;
  expect(query.getQueryData<BoardDetail>(key)?.cards[0].title).toBe("Updated");
  query.clear();
});

it("refetches when the reducer cannot reconcile an unknown card", async () => {
  const query = new QueryClient();
  const invalidate = vi.spyOn(query, "invalidateQueries");
  query.setQueryData(key, { ...detail, cards: [] });
  await applyMutation(query, boardId, actorId, mutations[1], origin);
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: key,
    exact: true,
    refetchType: "all",
  });
  query.clear();
});

it("treats card deletion 404 as success and preserves other API errors", async () => {
  const query = new QueryClient();
  query.setQueryData(key, detail);
  const result = await deleteCardResult(card.id, async () => {
    throw new ApiError(404, "NOT_FOUND", "Resource not found");
  });
  await applyMutation(query, boardId, actorId, result, origin);
  expect(query.getQueryData<BoardDetail>(key)?.cards).toEqual([]);
  await expect(
    deleteCardResult(card.id, async () => {
      throw new ApiError(403, "FORBIDDEN", "Forbidden");
    }),
  ).rejects.toMatchObject({ status: 403 });
  query.clear();
});
