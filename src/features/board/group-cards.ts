import type { Card } from "@/shared/board";

export function groupCardsByColumn(cards: readonly Card[]) {
  const grouped = new Map<string, Card[]>();
  for (const card of cards) {
    const group = grouped.get(card.columnId);
    if (group) group.push(card);
    else grouped.set(card.columnId, [card]);
  }
  return grouped;
}
