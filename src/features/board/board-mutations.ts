"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { apiClient, type ApiError } from "@/lib/api-client";
import type { BoardMember, Card, Column } from "@/shared/board";
import type { cardUpdateSchema } from "@/shared/kanban";
import {
  applyMutation,
  deleteCardResult,
  type BoardMutation,
} from "./apply-mutation";

export type MutationScope = { boardId: string; actorId: string };

function useBoardMutation<Input>(
  { boardId, actorId }: MutationScope,
  mutationFn: (input: Input) => Promise<BoardMutation>,
) {
  const query = useQueryClient();
  return useMutation<BoardMutation, ApiError, Input>({
    mutationFn,
    onSuccess: (result) => applyMutation(query, boardId, actorId, result),
  });
}

export function useCreateCard(scope: MutationScope) {
  return useBoardMutation(
    scope,
    async (body: { title: string; columnId: string }) => ({
      type: "card.created",
      entity: await apiClient<Card>("/api/cards", { method: "POST", body }),
    }),
  );
}

export function useUpdateCard(scope: MutationScope) {
  return useBoardMutation(
    scope,
    async ({
      id,
      body,
    }: {
      id: string;
      body: z.infer<typeof cardUpdateSchema>;
    }) => ({
      type: "card.updated",
      entity: await apiClient<Card>(`/api/cards/${id}`, {
        method: "PATCH",
        body,
      }),
    }),
  );
}

export function useDeleteCard(scope: MutationScope) {
  return useBoardMutation(scope, (id: string) =>
    deleteCardResult(id, () =>
      apiClient<void>(`/api/cards/${id}`, { method: "DELETE" }),
    ),
  );
}

export function useCreateColumn(scope: MutationScope) {
  return useBoardMutation(scope, async (name: string) => ({
    type: "column.created",
    entity: await apiClient<Column>(`/api/boards/${scope.boardId}/columns`, {
      method: "POST",
      body: { name },
    }),
  }));
}

export function useRenameColumn(scope: MutationScope) {
  return useBoardMutation(
    scope,
    async ({ id, name }: { id: string; name: string }) => ({
      type: "column.updated",
      entity: await apiClient<Column>(`/api/columns/${id}`, {
        method: "PATCH",
        body: { name },
      }),
    }),
  );
}

export function useDeleteColumn(scope: MutationScope) {
  return useBoardMutation(scope, async (id: string) => {
    await apiClient<void>(`/api/columns/${id}`, { method: "DELETE" });
    return { type: "column.deleted", entity: { id } };
  });
}

export function useAddMember(scope: MutationScope) {
  return useBoardMutation(scope, async (email: string) => ({
    type: "member.added",
    entity: await apiClient<BoardMember>(
      `/api/boards/${scope.boardId}/members`,
      { method: "POST", body: { email } },
    ),
  }));
}
