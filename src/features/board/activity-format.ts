import type { ActivityEntry } from "@/shared/activity";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function quoted(value: unknown, fallback: string) {
  const name = text(value);
  return name ? `“${name}”` : fallback;
}

export function formatActivity(entry: ActivityEntry): string {
  const actor = entry.actor.name;
  const m = entry.metadata ?? {};
  const card = quoted(m.title, "a card");
  const column = quoted(m.columnName, "a column");

  switch (entry.action) {
    case "CARD_CREATED":
      return `${actor} created ${card}${text(m.columnName) ? ` in ${column}` : ""}`;
    case "CARD_DELETED":
      return `${actor} deleted ${card}`;
    case "CARD_MOVED":
      return `${actor} moved ${card}${text(m.fromColumnName) && text(m.toColumnName) ? ` from ${m.fromColumnName} to ${m.toColumnName}` : ""}`;
    case "CARD_UPDATED": {
      const title = quoted(m.cardTitle, "a card");
      const changes = [];
      for (const field of ["title", "priority", "assignee"] as const) {
        const value = m[field];
        if (
          !value ||
          typeof value !== "object" ||
          !("old" in value) ||
          !("new" in value)
        )
          continue;
        const show = (side: unknown) =>
          field === "assignee" && side === null ? "Unassigned" : text(side);
        const old = show(value.old);
        const next = show(value.new);
        if (old && next) changes.push(`${field} from “${old}” to “${next}”`);
      }
      if (!changes.length && m.descriptionChanged === true)
        return `${actor} edited the description of ${title}`;
      if (m.descriptionChanged === true) changes.push("description edited");
      return `${actor} updated ${title}${changes.length ? ` (${changes.join(", ")})` : ""}`;
    }
    case "COLUMN_CREATED":
      return `${actor} created ${column}`;
    case "COLUMN_RENAMED":
      return text(m.oldName) && text(m.columnName)
        ? `${actor} renamed “${m.oldName}” to ${column}`
        : `${actor} renamed ${column}`;
    case "COLUMN_DELETED":
      return `${actor} deleted ${column}`;
    case "COLUMN_REORDERED":
      return `${actor} reordered ${column}`;
    case "MEMBER_ADDED":
      return `${actor} added ${text(m.name) ?? "a member"}`;
  }
}
