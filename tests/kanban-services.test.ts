import { describe, expect, it, vi } from "vitest";
import type { Card, Column } from "../src/shared/board";
import { cardCreateSchema, nameSchema } from "../src/shared/kanban";
import { sanitizeText } from "../src/shared/sanitize";
import { MemoryEventBus } from "../src/server/realtime/event-bus";
import type { KanbanRepositories } from "../src/server/repositories/kanban.repository";
import { RepositoryConflict } from "../src/server/repositories/transaction";
import { createBoardService } from "../src/server/services/board.service";
import { createCardService } from "../src/server/services/card.service";
import { createColumnService } from "../src/server/services/column.service";
import { createMemberService } from "../src/server/services/member.service";
import {
  appendPosition,
  captureGap,
  positionInGap,
} from "../src/server/services/ordering";

const actor = { actorId: "actor", originClientId: null };
const date = "2026-01-01T00:00:00.000Z";
const timestamps = { createdAt: date, updatedAt: date };
const board = { ...timestamps, id: "board", ownerId: "owner", name: "Board" };
const column: Column = {
  ...timestamps,
  id: "column",
  boardId: board.id,
  name: "Backlog",
  position: "a0",
};
const card: Card = {
  ...timestamps,
  id: "card",
  boardId: board.id,
  columnId: column.id,
  title: "Card",
  position: "a0",
  priority: "MEDIUM",
  assigneeId: null,
  description: null,
};
const member = { id: "actor", email: "actor@example.com", name: "Actor" };

function fixture() {
  const db = {
    boards: {
      find: vi.fn().mockResolvedValue(board),
      lock: vi.fn(),
      lockOwner: vi.fn(),
      lockForRead: vi.fn(),
      create: vi.fn().mockResolvedValue(board),
      list: vi.fn().mockResolvedValue([board]),
      rename: vi
        .fn()
        .mockImplementation(async (_id, name) => ({ ...board, name })),
      countOwned: vi.fn().mockResolvedValue(0),
      remove: vi.fn(),
    },
    columns: {
      find: vi.fn().mockResolvedValue(column),
      list: vi.fn().mockResolvedValue([]),
      remove: vi.fn(),
      create: vi
        .fn()
        .mockImplementation(async (boardId, name, position) => ({
          ...column,
          boardId,
          name,
          position,
        })),
      update: vi
        .fn()
        .mockImplementation(async (_id, data) => ({ ...column, ...data })),
    },
    cards: {
      find: vi.fn().mockResolvedValue(card),
      list: vi.fn().mockResolvedValue([]),
      countOnBoard: vi.fn().mockResolvedValue(0),
      countInColumn: vi.fn().mockResolvedValue(0),
      create: vi
        .fn()
        .mockImplementation(async (data) => ({ ...card, ...data })),
      remove: vi.fn(),
      update: vi
        .fn()
        .mockImplementation(async (_id, patch) => ({ ...card, ...patch })),
    },
    members: {
      find: vi
        .fn()
        .mockImplementation(async (_board, userId) =>
          userId === member.id ? member : null,
        ),
      findUser: vi.fn(),
      list: vi.fn().mockResolvedValue([member]),
      count: vi.fn().mockResolvedValue(1),
      add: vi.fn(),
    },
    activity: { write: vi.fn() },
  };
  const committed = vi.fn();
  const events = { publish: vi.fn(), subscribe: vi.fn() };
  const deps = {
    async transaction<Result>(
      work: (repositories: KanbanRepositories) => Promise<Result>,
    ) {
      const result = await work(db as unknown as KanbanRepositories);
      committed();
      return result;
    },
    events,
  };
  return { db, committed, events, deps };
}

it("removes C0 controls, preserves tabs and line breaks in descriptions, and normalizes text", () => {
  expect(sanitizeText("  A\u0000\u0001\tB\nCafe\u0301\u001f  ")).toBe(
    "A\tB\nCafé",
  );
  expect(nameSchema.parse("  A \n\t\n Cafe\u0301\u0000  ")).toBe("A Café");
  expect(
    cardCreateSchema.parse({
      title: " title\ncontinued ",
      description: " \t\u0000 ",
      columnId: "21ad2cee-6d42-44b0-bb5c-53579caf66f3",
    }),
  ).toMatchObject({ title: "title continued", description: null });
});

describe("fractional ordering", () => {
  const left = { id: "left", position: "a0" };
  const right = { id: "right", position: "a1" };

  it("inserts at the start, end, and between neighbors after repeated inserts", () => {
    const items = [left, right];
    expect(
      positionInGap(
        items,
        captureGap(items, { previousId: null, nextId: left.id }),
      ) < left.position,
    ).toBe(true);
    expect(appendPosition(items) > right.position).toBe(true);
    let next = right;
    for (let index = 0; index < 100; index += 1) {
      const pair = [left, next];
      const position = positionInGap(
        pair,
        captureGap(pair, { previousId: left.id, nextId: next.id }),
      );
      expect(position > left.position && position < next.position).toBe(true);
      next = { id: String(index), position };
    }
  });

  it("rejects missing, reversed, and non-adjacent neighbors, and preserves in-flight anchors", () => {
    const items = [left, right];
    const gap = captureGap(items, { previousId: left.id, nextId: right.id });
    const middle = { id: "middle", position: positionInGap(items, gap) };
    const updated = [left, middle, right];
    expect(positionInGap(updated, gap) > middle.position).toBe(true);
    for (const neighbors of [
      { previousId: right.id, nextId: left.id },
      { previousId: "missing", nextId: right.id },
      { previousId: left.id, nextId: right.id },
    ]) {
      expect(() => captureGap(updated, neighbors)).toThrow(
        expect.objectContaining({ code: "STALE_ORDER" }),
      );
    }
    expect(() => positionInGap([left], gap)).toThrow(
      expect.objectContaining({ code: "STALE_ORDER" }),
    );
  });
});

it("rejects nonmembers, member deletion of a board, and deletion of a populated column", async () => {
  const { db, deps } = fixture();
  await expect(
    createBoardService(deps).remove(board.id, {
      ...actor,
      actorId: "outsider",
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    createBoardService(deps).remove(board.id, actor),
  ).rejects.toMatchObject({ status: 403 });
  db.cards.countInColumn.mockResolvedValue(1);
  await expect(
    createColumnService(deps).remove(column.id, actor),
  ).rejects.toMatchObject({ status: 409 });
  expect(db.boards.remove).not.toHaveBeenCalled();
  expect(db.columns.remove).not.toHaveBeenCalled();
  expect(db.activity.write).not.toHaveBeenCalled();
});

it("enforces all four limits and rejects missing or duplicate members", async () => {
  const { db, deps } = fixture();
  db.boards.countOwned.mockResolvedValue(20);
  db.columns.list.mockResolvedValue(Array(12).fill(column));
  db.cards.countOnBoard.mockResolvedValue(500);
  db.members.count.mockResolvedValue(20);
  const members = createMemberService(deps);
  await expect(
    members.add(board.id, "absent@example.com", actor),
  ).rejects.toMatchObject({ status: 404 });
  db.members.findUser.mockResolvedValueOnce(member);
  await expect(
    members.add(board.id, member.email, actor),
  ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
  db.members.findUser.mockResolvedValue({ ...member, id: "new" });
  for (const run of [
    () => createBoardService(deps).create("Board", actor),
    () => createColumnService(deps).create(board.id, "More", actor),
    () =>
      createCardService(deps).create(
        { columnId: column.id, title: "More" },
        actor,
      ),
    () => members.add(board.id, member.email, actor),
  ])
    await expect(run()).rejects.toMatchObject({
      status: 409,
      code: "LIMIT_REACHED",
    });
});

it("rejects nonmember assignees and columns that do not belong to the card's board", async () => {
  const { db, deps } = fixture();
  const cards = createCardService(deps);
  await expect(
    cards.create(
      { columnId: column.id, title: "Card", assigneeId: "outsider" },
      actor,
    ),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    cards.update(card.id, { assigneeId: "outsider" }, actor),
  ).rejects.toMatchObject({ code: "INVALID_ASSIGNEE" });
  db.columns.find.mockResolvedValue({ ...column, boardId: "other" });
  await expect(
    cards.move(
      card.id,
      { columnId: column.id, previousId: null, nextId: null },
      actor,
    ),
  ).rejects.toMatchObject({ code: "INVALID_COLUMN" });
  await expect(cards.update(card.id, {}, actor)).rejects.toMatchObject({
    code: "INVALID_COLUMN",
  });
});

it("omits no-op side effects and publishes committed snapshots without description content", async () => {
  const { db, deps, committed, events } = fixture();
  const cards = createCardService(deps);
  await expect(
    cards.update(card.id, { title: card.title }, actor),
  ).resolves.toEqual(card);
  expect(db.cards.update).not.toHaveBeenCalled();
  expect(db.activity.write).not.toHaveBeenCalled();
  expect(events.publish).not.toHaveBeenCalled();
  committed.mockClear();
  await cards.update(
    card.id,
    {
      title: "New",
      description: "private text",
      priority: "HIGH",
      assigneeId: member.id,
    },
    actor,
  );
  expect(db.activity.write).toHaveBeenCalledWith(
    expect.objectContaining({
      metadata: {
        cardTitle: "New",
        columnName: column.name,
        title: { old: "Card", new: "New" },
        priority: { old: "MEDIUM", new: "HIGH" },
        descriptionChanged: true,
        assignee: { old: null, new: "Actor" },
      },
    }),
  );
  expect(events.publish.mock.invocationCallOrder[0]).toBeGreaterThan(
    committed.mock.invocationCallOrder[0],
  );
  db.activity.write.mockRejectedValueOnce(new Error("rollback"));
  events.publish.mockClear();
  await expect(
    cards.update(card.id, { title: "Aborted" }, actor),
  ).rejects.toThrow("rollback");
  expect(events.publish).not.toHaveBeenCalled();
});

it("retries uniqueness conflicts three times and contains event publishing failures", async () => {
  const { db, deps, events } = fixture();
  const cards = createCardService(deps);
  db.cards.update.mockRejectedValue(new RepositoryConflict(undefined));
  const move = { columnId: column.id, previousId: null, nextId: null };
  db.cards.find.mockResolvedValue({ ...card, columnId: "source" });
  db.columns.find.mockImplementation(async (id) => ({ ...column, id }));
  await expect(cards.move(card.id, move, actor)).rejects.toMatchObject({
    status: 409,
    code: "STALE_ORDER",
  });
  expect(db.cards.update).toHaveBeenCalledTimes(4);
  expect(events.publish).not.toHaveBeenCalled();

  db.cards.update.mockResolvedValue({ ...card, title: "Committed" });
  events.publish.mockRejectedValueOnce(new Error("listener failure"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(
      cards.update(card.id, { title: "Committed" }, actor),
    ).resolves.toMatchObject({ title: "Committed" });
    expect(log).toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});

it("isolates event subscriptions per board and supports independent unsubscription", async () => {
  const bus = new MemoryEventBus<string>();
  const listener = vi.fn();
  const stop = bus.subscribe("a", listener);
  const other = bus.subscribe("a", listener);
  await bus.publish("b", "ignored");
  stop();
  await bus.publish("a", "one");
  other();
  await bus.publish("a", "ignored");
  expect(listener.mock.calls).toEqual([["one"]]);
});

it("creates the board and creator membership with ordered default columns and no activity", async () => {
  const { db, deps, events } = fixture();
  const boards = createBoardService(deps);
  const result = await boards.create("Board", actor);
  expect(result.members).toEqual([member]);
  expect(result.cards).toEqual([]);
  expect(result.columns.map(({ name }) => name)).toEqual([
    "Backlog",
    "In Progress",
    "In Review",
    "Done",
  ]);
  const positions = result.columns.map(({ position }) => position);
  expect(positions).toEqual([...new Set(positions)].sort());
  expect(db.members.add).toHaveBeenCalledWith(board.id, actor.actorId);
  expect(db.activity.write).not.toHaveBeenCalled();
  expect(events.publish).not.toHaveBeenCalled();
  await expect(boards.list(actor.actorId)).resolves.toEqual([board]);
  expect(db.boards.list).toHaveBeenCalledWith(actor.actorId);

  await boards.rename(board.id, board.name, actor);
  expect(events.publish).not.toHaveBeenCalled();
  await boards.rename(board.id, "Renamed", actor);
  expect(events.publish).toHaveBeenLastCalledWith(
    board.id,
    expect.objectContaining({ type: "board.updated" }),
  );
  db.members.find.mockResolvedValue(member);
  await boards.remove(board.id, { ...actor, actorId: board.ownerId });
  expect(db.boards.remove).toHaveBeenCalledWith(board.id);
  expect(events.publish).toHaveBeenLastCalledWith(
    board.id,
    expect.objectContaining({ type: "board.deleted" }),
  );
});

it("appends columns and cards and captures member, column, and card deletion snapshots", async () => {
  const { db, deps, events } = fixture();
  const columns = createColumnService(deps);
  const cards = createCardService(deps);
  const members = createMemberService(deps);
  const invited = {
    id: "invited",
    email: "invited@example.com",
    name: "Invited",
  };
  db.members.findUser.mockResolvedValue(invited);
  await expect(members.add(board.id, invited.email, actor)).resolves.toEqual(
    invited,
  );
  expect(db.activity.write).toHaveBeenLastCalledWith(
    expect.objectContaining({
      action: "MEMBER_ADDED",
      metadata: {
        memberId: invited.id,
        email: invited.email,
        name: invited.name,
      },
    }),
  );

  db.columns.list.mockResolvedValue([column]);
  const extra = await columns.create(board.id, "Extra", actor);
  expect(extra.position > column.position).toBe(true);
  await columns.rename(column.id, column.name, actor);
  expect(db.columns.update).not.toHaveBeenCalled();
  await columns.rename(column.id, "Renamed", actor);
  expect(db.activity.write).toHaveBeenLastCalledWith(
    expect.objectContaining({
      action: "COLUMN_RENAMED",
      metadata: { columnName: "Renamed", oldName: column.name },
    }),
  );

  db.cards.list.mockResolvedValue([card]);
  const added = await cards.create(
    { title: "New", columnId: column.id, assigneeId: member.id },
    actor,
  );
  expect(added.position > card.position).toBe(true);
  expect(added).toMatchObject({
    boardId: board.id,
    columnId: column.id,
    assigneeId: member.id,
  });
  await cards.remove(card.id, actor);
  expect(db.activity.write).toHaveBeenLastCalledWith(
    expect.objectContaining({
      action: "CARD_DELETED",
      metadata: {
        cardId: card.id,
        columnId: column.id,
        title: card.title,
        columnName: column.name,
      },
    }),
  );
  await columns.remove(column.id, actor);
  expect(db.activity.write).toHaveBeenLastCalledWith(
    expect.objectContaining({
      action: "COLUMN_DELETED",
      metadata: { columnId: column.id, columnName: column.name },
    }),
  );
  expect(events.publish).toHaveBeenLastCalledWith(
    board.id,
    expect.objectContaining({ type: "column.deleted" }),
  );
});
