import type { Card } from "@/shared/board";
import { cardUpdateSchema } from "@/shared/kanban";

export function cardDiff(
  original: Card,
  values: {
    title: string;
    description: string;
    priority: string;
    assigneeId: string;
  },
) {
  const parsed = cardUpdateSchema.safeParse({
    ...values,
    assigneeId: values.assigneeId || null,
  });
  if (!parsed.success) return parsed;
  const { title, description, priority, assigneeId } = parsed.data;
  return {
    success: true as const,
    data: {
      ...(title !== original.title && { title }),
      ...(description !== original.description && { description }),
      ...(priority !== original.priority && { priority }),
      ...(assigneeId !== original.assigneeId && { assigneeId }),
    },
  };
}
