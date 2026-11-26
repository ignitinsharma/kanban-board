import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import type { BoardDetail, Card } from "@/shared/board";
import { applyMutation } from "./apply-mutation";
import { boardDetailQuery } from "./board-query";
import {
  applyOptimisticMove,
  prepareMove,
  revertMove,
  type Drop,
} from "./drag-logic";

export type MoveInput = { id: string; drop: Drop; onPrepared?: () => void };

export async function commitCardMove(
  query: QueryClient,
  boardId: string,
  actorId: string,
  { id, drop, onPrepared }: MoveInput,
  request: () => Promise<Card>,
) {
  const { queryKey } = boardDetailQuery(boardId);
  const filters = { queryKey, exact: true };
  await query.cancelQueries(filters, { revert: false });
  const board = query.getQueryData<BoardDetail>(queryKey);
  const snapshot = board && prepareMove(board, id, drop);
  if (!snapshot) {
    onPrepared?.();
    await query.invalidateQueries({ ...filters, refetchType: "all" });
    throw new ApiError(
      409,
      "STALE_ORDER",
      "The board changed. Your move was not applied.",
    );
  }

  query.setQueryData<BoardDetail>(
    queryKey,
    (current) =>
      current &&
      applyOptimisticMove(
        current,
        id,
        snapshot.optimistic.columnId,
        snapshot.optimistic.position,
      ),
  );
  onPrepared?.();
  let card: Card;
  try {
    card = await request();
  } catch (error) {
    await query.cancelQueries(filters, { revert: false });
    query.setQueryData<BoardDetail>(queryKey, (current) => {
      if (!current) return;
      const reverted = revertMove(current, snapshot);
      return reverted === current ? undefined : reverted;
    });
    if (
      !(error instanceof ApiError) ||
      error.status === 409 ||
      error.status === 404 ||
      error.status >= 500
    ) {
      await query.invalidateQueries({ ...filters, refetchType: "all" });
    }
    throw error;
  }
  await applyMutation(query, boardId, actorId, {
    type: "card.moved",
    entity: card,
  });
  return card;
}
