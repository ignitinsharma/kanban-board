import { expect, it } from "vitest";
import { ActivityAction, CardPriority } from "../prisma/generated/enums";
import {
  activityActionSchema,
  activityCursorSchema,
  boardInputSchema,
  cardCreateSchema,
  cardFiltersSchema,
  cardMoveSchema,
  cardPrioritySchema,
  cardUpdateSchema,
  emailSchema,
} from "../src/shared/kanban";

const id = "21ad2cee-6d42-44b0-bb5c-53579caf66f3";

it("shares the same enum values as Prisma", () => {
  expect(cardPrioritySchema.options).toEqual(Object.values(CardPriority));
  expect(activityActionSchema.options).toEqual(Object.values(ActivityAction));
});

it("normalizes ASCII email and rejects malformed input", () => {
  expect(emailSchema.parse("  PERSON@Example.COM  ")).toBe(
    "person@example.com",
  );
  expect(emailSchema.safeParse("é@example.com").success).toBe(false);
  expect(boardInputSchema.safeParse({ name: "  " }).success).toBe(false);
  expect(
    cardCreateSchema.safeParse({ title: "Card", columnId: "invalid" }).success,
  ).toBe(false);
  expect(cardMoveSchema.safeParse({ columnId: id, nextId: null }).success).toBe(
    false,
  );
  expect(cardUpdateSchema.parse({ assigneeId: null })).toEqual({
    assigneeId: null,
  });
  expect(cardFiltersSchema.safeParse({ priority: "UNKNOWN" }).success).toBe(
    false,
  );
  expect(
    activityCursorSchema.safeParse({ id, createdAt: "2026-01-01" }).success,
  ).toBe(false);
});

it("enforces trimmed name, title, and description limits", () => {
  expect(boardInputSchema.parse({ name: "x".repeat(100) }).name).toHaveLength(
    100,
  );
  expect(boardInputSchema.safeParse({ name: "x".repeat(101) }).success).toBe(
    false,
  );
  expect(
    cardCreateSchema.parse({ columnId: id, title: "x".repeat(200) }).title,
  ).toHaveLength(200);
  expect(cardUpdateSchema.safeParse({ title: "x".repeat(201) }).success).toBe(
    false,
  );
  expect(
    cardUpdateSchema.parse({ description: " " + "x".repeat(5000) + " " })
      .description,
  ).toHaveLength(5000);
  expect(
    cardUpdateSchema.safeParse({ description: "x".repeat(5001) }).success,
  ).toBe(false);
  expect(cardUpdateSchema.parse({ description: "  " }).description).toBeNull();
});
