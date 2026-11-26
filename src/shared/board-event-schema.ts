import { z } from "zod";
import type { BoardEvent } from "./events";
import { cardPrioritySchema, idSchema } from "./kanban";

const named = z.strictObject({ id: idSchema, name: z.string() });
const deleted = z.strictObject({ id: idSchema });
const times = { createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };
const column = named.extend({
  boardId: idSchema,
  position: z.string(),
  ...times,
});
const card = deleted.extend({
  boardId: idSchema,
  columnId: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  priority: cardPrioritySchema,
  assigneeId: idSchema.nullable(),
  position: z.string(),
  ...times,
});
const entities = {
  "board.updated": named.extend({ ownerId: idSchema, ...times }),
  "board.deleted": deleted,
  "member.added": named.extend({ email: z.email() }),
  "column.created": column,
  "column.updated": column,
  "column.moved": column,
  "column.deleted": deleted,
  "card.created": card,
  "card.updated": card,
  "card.moved": card,
  "card.deleted": deleted,
} satisfies Record<BoardEvent["type"], z.ZodType>;

export const boardEventTypes = Object.keys(entities) as BoardEvent["type"][];

const envelope = z.strictObject({
  type: z.enum(boardEventTypes),
  boardId: idSchema,
  actorId: idSchema,
  originClientId: idSchema.nullable(),
  entity: z.unknown(),
});

export function parseBoardEvent(
  value: unknown,
  type: string,
): BoardEvent | null {
  const parsed = envelope.safeParse(value);
  if (!parsed.success || parsed.data.type !== type) return null;
  const entity = entities[parsed.data.type].safeParse(parsed.data.entity);
  return entity.success
    ? ({ ...parsed.data, entity: entity.data } as BoardEvent)
    : null;
}
