import { queryOptions } from "@tanstack/react-query";
import { apiClient, ApiError } from "@/lib/api-client";
import type { BoardDetail } from "@/shared/board";

export { ApiError as BoardRequestError };

export const boardListKey = ["boards"] as const;

export function boardDetailQuery(boardId: string) {
  return queryOptions({
    queryKey: [...boardListKey, boardId] as const,
    queryFn: ({ signal }) =>
      apiClient<BoardDetail>(`/api/boards/${encodeURIComponent(boardId)}`, {
        signal,
      }),
    retry: false,
  });
}
