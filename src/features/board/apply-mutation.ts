import type { QueryClient } from "@tanstack/react-query";
import { ApiError, getClientId } from "@/lib/api-client";
import { applyBoardEvent } from "@/shared/apply-board-event";
import type { BoardDetail } from "@/shared/board";
import type { BoardEvent } from "@/shared/events";
import { boardDetailQuery } from "./board-query";

type MutationType =
  | "card.created"
  | "card.updated"
  | "card.deleted"
  | "column.created"
  | "column.updated"
  | "column.deleted"
  | "member.added";

export type BoardMutation = {
  [Type in MutationType]: Pick<
    Extract<BoardEvent, { type: Type }>,
    "type" | "entity"
  >;
}[MutationType];

export function mutationEvent(
  boardId: string,
  actorId: string,
  originClientId: string,
  mutation: BoardMutation,
): BoardEvent {
  return { ...mutation, boardId, actorId, originClientId };
}

export async function applyMutation(
  query: QueryClient,
  boardId: string,
  actorId: string,
  mutation: BoardMutation,
  originClientId = getClientId(),
) {
  const options = boardDetailQuery(boardId);
  const filters = { queryKey: options.queryKey, exact: true };
  await query.cancelQueries(filters, { revert: false });
  const event = mutationEvent(boardId, actorId, originClientId, mutation);
  let needsRefetch = false;

  query.setQueryData<BoardDetail>(options.queryKey, (current) => {
    if (!current) {
      needsRefetch = true;
      return undefined;
    }
    const result = applyBoardEvent(current, event);
    needsRefetch = result.needsRefetch;
    return result.boardDetail ?? undefined;
  });

  if (needsRefetch)
    await query.invalidateQueries({ ...filters, refetchType: "all" });
}

export async function deleteCardResult(
  id: string,
  remove: () => Promise<void>,
) {
  try {
    await remove();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
  }
  return { type: "card.deleted", entity: { id } } as const;
}
