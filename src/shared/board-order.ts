import type { BoardDetail } from "./board";

type Positioned = { id: string; position: string };

export function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byPosition(a: Positioned, b: Positioned) {
  return compare(a.position, b.position) || compare(a.id, b.id);
}

export function orderBoard(board: BoardDetail): BoardDetail {
  const columns = [...board.columns].sort(byPosition);
  const indices = new Map(columns.map(({ id }, index) => [id, index]));
  const cards = [...board.cards].sort(
    (a, b) =>
      (indices.get(a.columnId) ?? Infinity) -
        (indices.get(b.columnId) ?? Infinity) || byPosition(a, b),
  );
  return { ...board, columns, cards };
}
