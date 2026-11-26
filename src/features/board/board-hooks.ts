"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { Board, BoardDetail } from "@/shared/board";
import { boardDetailQuery, boardListKey } from "./board-query";

export function useBoards() {
  return useQuery({
    queryKey: boardListKey,
    queryFn: ({ signal }) => apiClient<Board[]>("/api/boards", { signal }),
    retry: false,
  });
}

export function useBoard(boardId: string, { enabled = true } = {}) {
  return useQuery({ ...boardDetailQuery(boardId), enabled });
}

export function useCreateBoard() {
  const query = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiClient<BoardDetail>("/api/boards", { method: "POST", body: { name } }),
    onSuccess: () =>
      query.invalidateQueries({ queryKey: boardListKey, exact: true }),
  });
}

export function useRenameBoard() {
  const query = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiClient<Board>(`/api/boards/${id}`, {
        method: "PATCH",
        body: { name },
      }),
    onSuccess: (_, { id }) =>
      Promise.all([
        query.invalidateQueries({ queryKey: boardListKey, exact: true }),
        query.invalidateQueries({
          queryKey: boardDetailQuery(id).queryKey,
          exact: true,
        }),
      ]),
  });
}

export function useDeleteBoard() {
  const query = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`/api/boards/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      query.removeQueries({
        queryKey: boardDetailQuery(id).queryKey,
        exact: true,
      });
      return query.invalidateQueries({ queryKey: boardListKey, exact: true });
    },
  });
}
