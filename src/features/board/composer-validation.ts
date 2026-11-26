import { nameSchema, titleSchema } from "@/shared/kanban";
import { sanitizeText } from "@/shared/sanitize";

export function isEmptyComposer(value: string) {
  return sanitizeText(value, true).length === 0;
}

export function parseComposer(
  value: string,
  kind: "card" | "column",
): { value: string } | { error: string } {
  const schema = kind === "card" ? titleSchema : nameSchema;
  const parsed = schema.safeParse(value);
  if (parsed.success) return { value: parsed.data };
  return {
    error:
      kind === "card"
        ? "Enter a title from 1 to 200 characters."
        : "Enter a column name from 1 to 100 characters.",
  };
}
