import { z } from "zod";
import type { ActivityAction } from "./kanban";

export type ActivityEntry = {
  id: string;
  action: ActivityAction;
  createdAt: string;
  actor: { id: string; name: string };
  cardId: string | null;
  columnId: string | null;
  metadata: Record<string, unknown>;
};

export type ActivityPage = {
  items: ActivityEntry[];
  nextCursor: string | null;
};

export const activityQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d{1,2}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(50))
    .default(30),
  cursor: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
});
