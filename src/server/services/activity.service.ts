import type { ActivityPage } from "@/shared/activity";
import { activityCursorSchema } from "@/shared/kanban";
import { BadRequestError } from "../http/errors";
import { runInTransaction } from "../repositories/transaction";
import { requireMembership } from "./board-context";

export async function listActivity(
  boardId: string,
  actorId: string,
  query: { limit: number; cursor?: string },
  transaction = runInTransaction,
): Promise<ActivityPage> {
  return transaction(async (db) => {
    await requireMembership(db, boardId, actorId);
    let cursor;
    if (query.cursor) {
      try {
        const bytes = Buffer.from(query.cursor, "base64url");
        if (bytes.toString("base64url") !== query.cursor) throw new Error();
        const parsed = activityCursorSchema.parse(
          JSON.parse(bytes.toString("utf8")),
        );
        cursor = { id: parsed.id, createdAt: new Date(parsed.createdAt) };
      } catch {
        throw new BadRequestError("Invalid activity cursor");
      }
    }
    const rows = await db.activity.list(boardId, query.limit + 1, cursor);
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        last && rows.length > query.limit
          ? Buffer.from(
              JSON.stringify({ id: last.id, createdAt: last.createdAt }),
            ).toString("base64url")
          : null,
    };
  });
}
