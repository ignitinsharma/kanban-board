import { describe, expect, it } from "vitest";
import type { BoardDetail, Card } from "../src/shared/board";
import {
  filterBoard,
  hasActiveFilters,
  matchesCard,
  parseFilters,
  searchTerms,
  serializeFilters,
  unfilteredBoard,
  type Filters,
} from "../src/features/board/filter-logic";

const alex = "21ad2cee-6d42-44b0-bb5c-53579caf66f3";
const jamie = "4c08f17a-1028-4905-b2c6-8e73bdff7e5c";
const date = "2026-01-01T00:00:00.000Z";
const timestamps = { createdAt: date, updatedAt: date };
const empty = { assignee: null, priority: null, q: "" } satisfies Filters;
const board: BoardDetail = {
  ...timestamps,
  id: "board",
  ownerId: alex,
  name: "School work",
  members: [],
  columns: [
    {
      ...timestamps,
      id: "todo",
      boardId: "board",
      name: "To do",
      position: "a0",
    },
    {
      ...timestamps,
      id: "done",
      boardId: "board",
      name: "Done",
      position: "a1",
    },
    {
      ...timestamps,
      id: "empty",
      boardId: "board",
      name: "Empty",
      position: "a2",
    },
  ],
  cards: [],
};

function card(id: string, fields: Partial<Card>): Card {
  return {
    ...timestamps,
    id,
    boardId: board.id,
    columnId: "todo",
    position: "a0",
    title: "Card",
    description: null,
    assigneeId: null,
    priority: "MEDIUM",
    ...fields,
  };
}

board.cards = [
  card("one", {
    title: "ÉCOLE survey",
    description: "Check the rollout",
    assigneeId: alex,
    priority: "HIGH",
    position: "a0Z",
  }),
  card("two", {
    title: "Operations",
    description: "École notes and rollout",
    assigneeId: jamie,
    priority: "LOW",
    position: "a0a",
  }),
  card("three", {
    title: "Rollout",
    description: "Archive",
    priority: "HIGH",
    columnId: "done",
  }),
];

describe("board filter URL", () => {
  it("drops invalid values individually and ignores unknown board members", () => {
    expect(
      parseFilters(
        new URLSearchParams(
          "assignee=invalid&priority=invalid&q=%20%20&extra=4",
        ),
      ),
    ).toEqual(empty);
    expect(
      parseFilters(
        new URLSearchParams({
          assignee: jamie,
          priority: "HIGH",
          q: " notes ",
        }),
        new Set([alex]),
      ),
    ).toEqual({ assignee: null, priority: "HIGH", q: "notes" });
    expect(
      parseFilters(
        new URLSearchParams({ assignee: "unassigned" }),
        new Set([alex]),
      ).assignee,
    ).toBe("unassigned");
    expect(parseFilters(new URLSearchParams({ assignee: alex })).assignee).toBe(
      alex,
    );
  });

  it("round-trips a stable encoded query and omits empty values", () => {
    const target: Filters = {
      assignee: "unassigned",
      priority: "MEDIUM",
      q: "école & notes",
    };
    const query = serializeFilters(target);
    expect(query).toBe(
      "assignee=unassigned&priority=MEDIUM&q=%C3%A9cole+%26+notes",
    );
    expect(parseFilters(new URLSearchParams(query))).toEqual(target);
    expect(serializeFilters({ ...empty, q: "  " })).toBe("");
    expect(serializeFilters({ ...empty, priority: "HIGH" })).toBe(
      "priority=HIGH",
    );
  });

  it("allows dragging only with no effective filter", () => {
    expect(hasActiveFilters(empty)).toBe(false);
    expect(hasActiveFilters({ ...empty, q: " \t " })).toBe(false);
    expect(hasActiveFilters({ ...empty, assignee: alex })).toBe(true);
    expect(hasActiveFilters({ ...empty, assignee: "unassigned" })).toBe(true);
    expect(hasActiveFilters({ ...empty, priority: "URGENT" })).toBe(true);
    expect(hasActiveFilters({ ...empty, q: "word" })).toBe(true);
  });
});

describe("board filter projection", () => {
  it("reuses the unfiltered grouping and keeps order and complete counts", () => {
    const full = unfilteredBoard(board);
    expect(filterBoard(board, empty)).toBe(full);
    expect(filterBoard(board, { ...empty, q: " " }).items).toBe(full.items);
    expect(full.items).toEqual({
      todo: ["one", "two"],
      done: ["three"],
      empty: [],
    });
    expect(full.counts).toEqual({ visible: 3, total: 3 });
  });

  it("filters by exact assignee, Unassigned and priority alone or in combination", () => {
    expect(filterBoard(board, { ...empty, assignee: alex }).items.todo).toEqual(
      ["one"],
    );
    expect(
      filterBoard(board, { ...empty, assignee: "unassigned" }).items.done,
    ).toEqual(["three"]);
    expect(filterBoard(board, { ...empty, priority: "HIGH" }).counts).toEqual({
      visible: 2,
      total: 3,
    });
    const combined = filterBoard(board, {
      assignee: alex,
      priority: "HIGH",
      q: "survey rollout",
    });
    expect(combined.byColumn).toEqual({
      todo: { visible: 1, total: 2 },
      done: { visible: 0, total: 1 },
      empty: { visible: 0, total: 0 },
    });
    expect(
      filterBoard(board, { assignee: jamie, priority: "HIGH", q: "" }).counts
        .visible,
    ).toBe(0);
  });

  it("matches every NFC and case-normalized term in either field, treating punctuation literally", () => {
    const normalized = searchTerms("  E\u0301COLE   ROLLOUT\t");
    expect(normalized).toEqual(["école", "rollout"]);
    expect(matchesCard(board.cards[0], empty, normalized)).toBe(true);
    expect(matchesCard(board.cards[1], empty, normalized)).toBe(true);
    expect(matchesCard(board.cards[2], empty, normalized)).toBe(false);
    expect(filterBoard(board, { ...empty, q: "archive" }).items.done).toEqual([
      "three",
    ]);
    expect(
      filterBoard(board, { ...empty, q: "survey archive" }).counts.visible,
    ).toBe(0);
    expect(
      matchesCard(
        card("literal", { title: "Fix [phase].*" }),
        empty,
        searchTerms("[phase].*"),
      ),
    ).toBe(true);
    expect(matchesCard(board.cards[0], empty, searchTerms(".*"))).toBe(false);
  });

  it("filters a 500-card board within a loose sanity bound", () => {
    const large = {
      ...board,
      cards: Array.from({ length: 500 }, (_, index) =>
        card(String(index), {
          title: index % 2 ? "École" : "Other",
          description: "Rollout notes",
          position: String(index).padStart(3, "0"),
        }),
      ),
    };
    const start = performance.now();
    expect(filterBoard(large, { ...empty, q: "école notes" }).counts).toEqual({
      visible: 250,
      total: 500,
    });
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
