import type { BoardEvent } from "@/shared/events";
import { AppError, NotFoundError } from "../http/errors";
import { boardEvents, type EventBus } from "../realtime/event-bus";
import type { KanbanRepositories } from "../repositories/kanban.repository";
import {
  RepositoryConflict,
  RepositoryNotFound,
  runInTransaction,
  type RunInTransaction,
} from "../repositories/transaction";

export type Actor = { actorId: string; originClientId: string | null };
export type BoardDependencies = {
  transaction: RunInTransaction;
  events: EventBus<BoardEvent>;
};

export const boardDependencies: BoardDependencies = {
  transaction: runInTransaction,
  events: boardEvents,
};

export async function requireMembership(
  db: KanbanRepositories,
  boardId: string,
  actorId: string,
) {
  if (!(await db.members.find(boardId, actorId)))
    throw new NotFoundError("Resource not found");
}

export async function lockBoard(
  db: KanbanRepositories,
  boardId: string,
  actorId: string,
) {
  await requireMembership(db, boardId, actorId);
  await db.boards.lock(boardId);
  await requireMembership(db, boardId, actorId);
}

export function enforceLimit(count: number, limit: number, message: string) {
  if (count >= limit) throw new AppError(409, "LIMIT_REACHED", message);
}

export async function mutate<Result>(
  deps: BoardDependencies,
  work: (
    db: KanbanRepositories,
  ) => Promise<{ result: Result; event?: BoardEvent }>,
  retryOrder = false,
) {
  let committed;
  for (let attempt = 0; ; attempt += 1) {
    try {
      committed = await deps.transaction(work);
      break;
    } catch (error) {
      if (error instanceof RepositoryNotFound)
        throw new NotFoundError("Resource not found");
      if (!(error instanceof RepositoryConflict)) throw error;
      if (retryOrder && attempt < 3) continue;
      if (retryOrder)
        throw new AppError(
          409,
          "STALE_ORDER",
          "Ordering changed. Reload and try again.",
        );
      throw new AppError(409, "CONFLICT", "Resource already exists");
    }
  }

  if (committed.event) {
    try {
      await deps.events.publish(committed.event.boardId, committed.event);
    } catch (error) {
      console.error("Unable to publish board event", error);
    }
  }
  return committed.result;
}
