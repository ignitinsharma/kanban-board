import { expect, it, vi } from "vitest";
import { formatActivity } from "@/features/board/activity-format";
import type { ActivityEntry } from "@/shared/activity";
import { listActivity } from "@/server/services/activity.service";
import type { KanbanRepositories } from "@/server/repositories/kanban.repository";
import type { RunInTransaction } from "@/server/repositories/transaction";

const entry: ActivityEntry = {
  id: "dbadd98e-fd7b-4b9c-b540-5738581a1e66",
  actor: { id: "actor", name: "Asha" },
  action: "CARD_UPDATED",
  createdAt: "2025-01-01T00:00:00.000Z",
  cardId: null,
  columnId: null,
  metadata: {},
};

const examples: [ActivityEntry["action"], ActivityEntry["metadata"], string][] =
  [
    [
      "CARD_CREATED",
      { title: "Fix login", columnName: "Done" },
      "created “Fix login” in “Done”",
    ],
    ["CARD_DELETED", { title: "Fix login" }, "deleted “Fix login”"],
    [
      "CARD_MOVED",
      { title: "Fix login", fromColumnName: "Backlog", toColumnName: "Done" },
      "moved “Fix login” from Backlog to Done",
    ],
    [
      "CARD_UPDATED",
      { cardTitle: "Fix login", descriptionChanged: true },
      "edited the description of “Fix login”",
    ],
    [
      "CARD_UPDATED",
      {
        priority: { old: "LOW", new: "HIGH" },
        title: { old: "Before", new: "After" },
        assignee: { old: null, new: "Lee" },
      },
      "updated a card (title from “Before” to “After”, priority from “LOW” to “HIGH”, assignee from “Unassigned” to “Lee”)",
    ],
    [
      "CARD_UPDATED",
      {
        title: 123,
        priority: [],
        assignee: { old: null },
        descriptionChanged: "yes",
      },
      "updated a card",
    ],
    ["COLUMN_CREATED", { columnName: "Done" }, "created “Done”"],
    [
      "COLUMN_RENAMED",
      { oldName: "Queue", columnName: "Backlog" },
      "renamed “Queue” to “Backlog”",
    ],
    ["COLUMN_DELETED", { columnName: "Done" }, "deleted “Done”"],
    ["COLUMN_REORDERED", { columnName: "Done" }, "reordered “Done”"],
    [
      "MEMBER_ADDED",
      { name: "Lee", email: "fixture@example.com" },
      "added Lee",
    ],
  ];

it.each(examples)(
  "formats %s without live entity references (%j)",
  (action, metadata, sentence) => {
    expect(formatActivity({ ...entry, action, metadata })).toBe(
      `Asha ${sentence}`,
    );
  },
);

it("checks membership before reading or decoding activity", async () => {
  const list = vi.fn();
  const transaction: RunInTransaction = (work) =>
    work({
      members: { find: async () => null },
      activity: { list },
    } as unknown as KanbanRepositories);
  await expect(
    listActivity("board", "actor", { limit: 1, cursor: "bad" }, transaction),
  ).rejects.toMatchObject({ status: 404 });
  expect(list).not.toHaveBeenCalled();
});

it("encodes the last returned row and decodes the next page boundary", async () => {
  const list = vi
    .fn()
    .mockResolvedValueOnce([entry, { ...entry, id: "older" }])
    .mockResolvedValueOnce([]);
  const transaction: RunInTransaction = (work) =>
    work({
      members: { find: async () => ({}) },
      activity: { list },
    } as unknown as KanbanRepositories);
  const page = await listActivity("board", "actor", { limit: 1 }, transaction);
  expect(page.items).toEqual([entry]);
  expect(page.nextCursor).toBeTruthy();
  expect(
    await listActivity(
      "board",
      "actor",
      { limit: 1, cursor: page.nextCursor! },
      transaction,
    ),
  ).toEqual({ items: [], nextCursor: null });
  expect(list).toHaveBeenLastCalledWith("board", 2, {
    id: entry.id,
    createdAt: new Date(entry.createdAt),
  });
});
