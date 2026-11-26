import { queryOptions } from "@tanstack/react-query";
import type { BoardDetail } from "@/shared/board";

export const boardListKey = ["boards"] as const;

export class BoardRequestError extends Error {
  constructor(readonly status: number) {
    super(`Unable to load board (${status})`);
  }
}

export function boardDetailQuery(boardId: string) {
  return queryOptions({
    queryKey: [...boardListKey, boardId] as const,
    async queryFn({ signal }): Promise<BoardDetail> {
      const response = await fetch(
        `/api/boards/${encodeURIComponent(boardId)}`,
        { signal, cache: "no-store", credentials: "same-origin" },
      );
      if (!response.ok) throw new BoardRequestError(response.status);
      return response.json();
    },
  });
}

let tabId: string | undefined;
export function getBoardClientId() {
  return (tabId ??= crypto.randomUUID());
}

export function boardMutationHeaders(clientId = getBoardClientId()) {
  return { "X-Client-Id": clientId };
}
