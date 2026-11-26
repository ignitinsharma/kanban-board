import type { BoardDetail } from "./board";
import type { BoardEvent } from "./events";

type Result = { boardDetail: BoardDetail | null; needsRefetch: boolean };
type Positioned = { id: string; position: string };

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byPosition(a: Positioned, b: Positioned) {
  return compare(a.position, b.position) || compare(a.id, b.id);
}

function order(board: BoardDetail): BoardDetail {
  const columns = [...board.columns].sort(byPosition);
  const indices = new Map(columns.map(({ id }, index) => [id, index]));
  const cards = [...board.cards].sort(
    (a, b) =>
      (indices.get(a.columnId) ?? Infinity) -
        (indices.get(b.columnId) ?? Infinity) || byPosition(a, b),
  );
  return { ...board, columns, cards };
}

function equal<T extends object>(a: T, b: T) {
  return (
    Object.keys(a).length === Object.keys(b).length &&
    (Object.keys(a) as (keyof T)[]).every((key) => a[key] === b[key])
  );
}

export function applyBoardEvent(
  boardDetail: BoardDetail,
  event: BoardEvent,
): Result {
  const unchanged = { boardDetail, needsRefetch: false };
  const refetch = { boardDetail, needsRefetch: true };
  const applied = (boardDetail: BoardDetail): Result => ({
    boardDetail,
    needsRefetch: false,
  });
  const { entity } = event;

  if (event.boardId !== boardDetail.id) return unchanged;
  if ("boardId" in entity && entity.boardId !== boardDetail.id) return refetch;

  function versioned<T extends { updatedAt: string }>(
    current: T | undefined,
    incoming: T,
    replace: () => Result,
    create = false,
  ): Result {
    if (!current) return create ? replace() : refetch;
    const difference =
      Date.parse(incoming.updatedAt) - Date.parse(current.updatedAt);
    if (difference > 0) return replace();
    if (difference < 0 || equal(current, incoming)) return unchanged;
    return refetch;
  }

  switch (event.type) {
    case "board.updated": {
      if (event.entity.id !== boardDetail.id) return refetch;
      const { columns, cards, members, ...current } = boardDetail;
      return versioned(current, event.entity, () =>
        applied({ ...event.entity, columns, cards, members }),
      );
    }
    case "board.deleted":
      return entity.id === boardDetail.id
        ? { boardDetail: null, needsRefetch: false }
        : refetch;
    case "member.added": {
      const member = boardDetail.members.find(({ id }) => id === entity.id);
      if (member) return equal(member, event.entity) ? unchanged : refetch;
      return applied({
        ...boardDetail,
        members: [...boardDetail.members, event.entity].sort((a, b) =>
          compare(a.id, b.id),
        ),
      });
    }
    case "column.created":
    case "column.updated":
    case "column.moved": {
      const column = event.entity;
      return versioned(
        boardDetail.columns.find(({ id }) => id === column.id),
        column,
        () =>
          applied(
            order({
              ...boardDetail,
              columns: [
                ...boardDetail.columns.filter(({ id }) => id !== column.id),
                column,
              ],
            }),
          ),
        event.type === "column.created",
      );
    }
    case "column.deleted": {
      const columns = boardDetail.columns.filter(({ id }) => id !== entity.id);
      const cards = boardDetail.cards.filter(
        ({ columnId }) => columnId !== entity.id,
      );
      const needsRefetch = cards.length !== boardDetail.cards.length;
      return columns.length === boardDetail.columns.length && !needsRefetch
        ? unchanged
        : { boardDetail: { ...boardDetail, columns, cards }, needsRefetch };
    }
    case "card.created":
    case "card.updated":
    case "card.moved": {
      const card = event.entity;
      return versioned(
        boardDetail.cards.find(({ id }) => id === card.id),
        card,
        () => {
          if (!boardDetail.columns.some(({ id }) => id === card.columnId))
            return refetch;
          return applied(
            order({
              ...boardDetail,
              cards: [
                ...boardDetail.cards.filter(({ id }) => id !== card.id),
                card,
              ],
            }),
          );
        },
        event.type === "card.created",
      );
    }
    case "card.deleted": {
      const cards = boardDetail.cards.filter(({ id }) => id !== entity.id);
      return cards.length === boardDetail.cards.length
        ? unchanged
        : applied({ ...boardDetail, cards });
    }
  }
}
