import { z } from "zod";
import type { BoardDetail, Card } from "@/shared/board";
import { cardFiltersSchema, type CardPriority } from "@/shared/kanban";
import { buildItems, type PreviewItems } from "./drag-logic";

export type Filters = {
  assignee: string | "unassigned" | null;
  priority: CardPriority | null;
  q: string;
};

const assigneeSchema = z.union([
  cardFiltersSchema.shape.assigneeId.unwrap(),
  z.literal("unassigned"),
]);

export function parseFilters(
  params: Pick<URLSearchParams, "get">,
  memberIds?: ReadonlySet<string>,
): Filters {
  const assignee =
    assigneeSchema.safeParse(params.get("assignee")).data ?? null;
  return {
    assignee:
      assignee &&
      memberIds &&
      assignee !== "unassigned" &&
      !memberIds.has(assignee)
        ? null
        : assignee,
    priority:
      cardFiltersSchema.shape.priority.safeParse(params.get("priority")).data ??
      null,
    q: cardFiltersSchema.shape.q.safeParse(params.get("q")).data ?? "",
  };
}

export function serializeFilters({ assignee, priority, q }: Filters) {
  const params = new URLSearchParams();
  if (assignee) params.set("assignee", assignee);
  if (priority) params.set("priority", priority);
  const search = cardFiltersSchema.shape.q.parse(q);
  if (search) params.set("q", search);
  return params.toString();
}

function normalize(value: string) {
  return value.normalize("NFC").toLocaleLowerCase();
}

export function searchTerms(value: string) {
  const normalized = normalize(value).trim();
  return normalized ? normalized.split(/\s+/u) : [];
}

export function hasActiveFilters({ assignee, priority, q }: Filters) {
  return Boolean(assignee || priority || q.trim());
}

export function matchesCard(
  card: Card,
  filters: Filters,
  terms: readonly string[],
) {
  if (
    filters.assignee &&
    card.assigneeId !==
      (filters.assignee === "unassigned" ? null : filters.assignee)
  )
    return false;
  if (filters.priority && card.priority !== filters.priority) return false;
  if (!terms.length) return true;

  const title = normalize(card.title);
  const description = normalize(card.description ?? "");
  return terms.every(
    (term) => title.includes(term) || description.includes(term),
  );
}

type Counts = { visible: number; total: number };
export type FilteredBoard = {
  items: PreviewItems;
  counts: Counts;
  byColumn: Readonly<Record<string, Counts>>;
};

// Query snapshots are immutable. Empty filters reuse their grouping across renders.
const fullBoards = new WeakMap<BoardDetail, FilteredBoard>();

export function unfilteredBoard(detail: BoardDetail): FilteredBoard {
  const cached = fullBoards.get(detail);
  if (cached) return cached;
  const items = buildItems(detail);
  const byColumn = Object.fromEntries(
    Object.entries(items).map(([id, cards]) => [
      id,
      { visible: cards.length, total: cards.length },
    ]),
  );
  const full = {
    items,
    byColumn,
    counts: { visible: detail.cards.length, total: detail.cards.length },
  };
  fullBoards.set(detail, full);
  return full;
}

export function filterBoard(
  detail: BoardDetail,
  filters: Filters,
): FilteredBoard {
  const full = unfilteredBoard(detail);
  if (!hasActiveFilters(filters)) return full;

  const terms = searchTerms(filters.q);
  const matching = new Set(
    detail.cards
      .filter((card) => matchesCard(card, filters, terms))
      .map(({ id }) => id),
  );
  const items: Record<string, readonly string[]> = {};
  const byColumn: Record<string, Counts> = {};
  for (const [id, all] of Object.entries(full.items)) {
    const visible = all.filter((cardId) => matching.has(cardId));
    items[id] = visible.length === all.length ? all : visible;
    byColumn[id] = { visible: visible.length, total: all.length };
  }
  return {
    items,
    byColumn,
    counts: { visible: matching.size, total: full.counts.total },
  };
}
