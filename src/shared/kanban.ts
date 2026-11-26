import { z } from "zod";

export const cardPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export const activityActionSchema = z.enum([
  "CARD_CREATED",
  "CARD_UPDATED",
  "CARD_MOVED",
  "CARD_DELETED",
  "COLUMN_CREATED",
  "COLUMN_RENAMED",
  "COLUMN_DELETED",
  "COLUMN_REORDERED",
  "MEMBER_ADDED",
]);

export type CardPriority = z.infer<typeof cardPrioritySchema>;
export type ActivityAction = z.infer<typeof activityActionSchema>;

export const idSchema = z.uuid();
export const emailSchema = z
  .string()
  .trim()
  .pipe(z.email())
  .transform((email) => email.toLowerCase());
export const nameSchema = z.string().trim().min(1).max(100);
export const titleSchema = z.string().trim().min(1).max(200);

export const boardInputSchema = z.strictObject({ name: nameSchema });
export const columnInputSchema = z.strictObject({ name: nameSchema });
export const memberAddSchema = z.strictObject({ email: emailSchema });

const cardFieldsSchema = z.strictObject({
  title: titleSchema,
  description: z
    .string()
    .trim()
    .max(5000)
    .transform((value) => value || null)
    .nullable()
    .optional(),
  priority: cardPrioritySchema.optional(),
  assigneeId: idSchema.nullable().optional(),
});

export const cardCreateSchema = cardFieldsSchema.extend({ columnId: idSchema });
export const cardUpdateSchema = cardFieldsSchema.partial();

export const reorderSchema = z.strictObject({
  previousId: idSchema.nullable(),
  nextId: idSchema.nullable(),
});

export const cardMoveSchema = reorderSchema.extend({ columnId: idSchema });

export const cardFiltersSchema = z.strictObject({
  assigneeId: idSchema.optional(),
  priority: cardPrioritySchema.optional(),
  q: z.string().trim().optional(),
});

export const activityCursorSchema = z.strictObject({
  createdAt: z.iso.datetime({ precision: 3 }),
  id: idSchema,
});
