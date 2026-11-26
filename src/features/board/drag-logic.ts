import { generateKeyBetween } from "fractional-indexing";
import type { BoardDetail, Card } from "@/shared/board";
import { orderBoard } from "@/shared/board-order";

export type PreviewItems = Readonly<Record<string, readonly string[]>>;
export type Drop = {
  columnId: string;
  previousId: string | null;
  nextId: string | null;
};
type Location = Pick<Card, "columnId" | "position" | "updatedAt">;

export type MoveSnapshot = {
  cardId: string;
  original: Location;
  optimistic: Location;
};

export function buildItems(board: BoardDetail): PreviewItems {
  const ordered = orderBoard(board);
  const items: Record<string, string[]> = Object.fromEntries(
    ordered.columns.map(({ id }) => [id, []]),
  );
  for (const card of ordered.cards) items[card.columnId]?.push(card.id);
  return items;
}

export function cardSlot(items: PreviewItems, id: string) {
  for (const columnId in items) {
    const index = items[columnId].indexOf(id);
    if (index >= 0) return { columnId, index };
  }
  return null;
}

// The destination index is the insertion index after excluding the active card.
export function moveInPreview(
  items: PreviewItems,
  activeId: string,
  overContainerId: string,
  overIndex: number,
): PreviewItems {
  const source = cardSlot(items, activeId);
  const target = items[overContainerId];
  if (!source || !target) return items;
  const sameColumn = source.columnId === overContainerId;
  const siblings = sameColumn ? target.filter((id) => id !== activeId) : target;
  const index = Math.max(0, Math.min(overIndex, siblings.length));
  if (sameColumn && source.index === index) return items;
  const next = { ...items };
  if (!sameColumn)
    next[source.columnId] = items[source.columnId].filter(
      (id) => id !== activeId,
    );
  next[overContainerId] = [
    ...siblings.slice(0, index),
    activeId,
    ...siblings.slice(index),
  ];
  return next;
}

export function computeDrop(
  items: PreviewItems,
  activeId: string,
): Drop | null {
  const slot = cardSlot(items, activeId);
  if (!slot) return null;
  const cards = items[slot.columnId];
  return {
    columnId: slot.columnId,
    previousId: cards[slot.index - 1] ?? null,
    nextId: cards[slot.index + 1] ?? null,
  };
}

export function isNoop(original: Drop | null, drop: Drop) {
  return (
    original?.columnId === drop.columnId &&
    original.previousId === drop.previousId &&
    original.nextId === drop.nextId
  );
}

export function rebuildPreview(
  items: PreviewItems,
  latest: PreviewItems,
  activeId: string,
): PreviewItems | null {
  const target = computeDrop(items, activeId);
  if (!target || !latest[target.columnId] || !cardSlot(latest, activeId))
    return null;
  const siblings = latest[target.columnId].filter((id) => id !== activeId);
  const next = target.nextId === null ? -1 : siblings.indexOf(target.nextId);
  const previous =
    target.previousId === null ? -1 : siblings.indexOf(target.previousId);
  const index =
    next >= 0
      ? next
      : previous >= 0
        ? previous + 1
        : cardSlot(items, activeId)!.index;
  return moveInPreview(latest, activeId, target.columnId, index);
}

export function optimisticPosition(
  previous: string | null,
  next: string | null,
) {
  if (previous !== null && next !== null && previous >= next) return null;
  return generateKeyBetween(previous, next);
}

export function applyOptimisticMove(
  board: BoardDetail,
  cardId: string,
  columnId: string,
  position: string,
) {
  if (
    !board.cards.some((card) => card.id === cardId) ||
    !board.columns.some((column) => column.id === columnId)
  )
    return board;
  return orderBoard({
    ...board,
    cards: board.cards.map((card) =>
      card.id === cardId ? { ...card, columnId, position } : card,
    ),
  });
}

export function revertMove(board: BoardDetail, snapshot: MoveSnapshot) {
  const card = board.cards.find(({ id }) => id === snapshot.cardId);
  const { optimistic, original } = snapshot;
  if (
    !card ||
    card.columnId !== optimistic.columnId ||
    card.position !== optimistic.position ||
    card.updatedAt !== optimistic.updatedAt ||
    !board.columns.some(({ id }) => id === original.columnId)
  )
    return board;
  return orderBoard({
    ...board,
    cards: board.cards.map((item) =>
      item === card ? { ...item, ...original } : item,
    ),
  });
}

export function prepareMove(board: BoardDetail, cardId: string, drop: Drop) {
  const card = board.cards.find(({ id }) => id === cardId);
  const cards = buildItems(board)[drop.columnId]?.filter((id) => id !== cardId);
  if (!card || !cards) return null;
  const previousIndex =
    drop.previousId === null ? -1 : cards.indexOf(drop.previousId);
  const nextIndex =
    drop.nextId === null ? cards.length : cards.indexOf(drop.nextId);
  if (
    (drop.previousId !== null && previousIndex < 0) ||
    nextIndex !== previousIndex + 1
  )
    return null;
  const previous =
    board.cards.find(({ id }) => id === drop.previousId)?.position ?? null;
  const next =
    board.cards.find(({ id }) => id === drop.nextId)?.position ?? null;
  const position = optimisticPosition(previous, next);
  if (position === null) return null;
  const original = {
    columnId: card.columnId,
    position: card.position,
    updatedAt: card.updatedAt,
  };
  return {
    cardId,
    original,
    optimistic: { ...original, columnId: drop.columnId, position },
  };
}
