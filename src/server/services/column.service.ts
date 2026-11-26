import type { z } from "zod";
import type { reorderSchema } from "@/shared/kanban";
import { AppError, NotFoundError } from "../http/errors";
import type { KanbanRepositories } from "../repositories/kanban.repository";
import {
  boardDependencies,
  enforceLimit,
  lockBoard,
  mutate,
  requireMembership,
  type Actor,
  type BoardDependencies,
} from "./board-context";
import { appendPosition, captureGap, positionInGap } from "./ordering";

async function findColumn(db: KanbanRepositories, id: string) {
  const column = await db.columns.find(id);
  if (!column) throw new NotFoundError("Resource not found");
  return column;
}

export function createColumnService(deps: BoardDependencies) {
  return {
    create(boardId: string, name: string, actor: Actor) {
      return mutate(
        deps,
        async (db) => {
          await lockBoard(db, boardId, actor.actorId);
          const siblings = await db.columns.list(boardId);
          enforceLimit(
            siblings.length,
            12,
            "A board can have at most 12 columns",
          );
          const entity = await db.columns.create(
            boardId,
            name,
            appendPosition(siblings),
          );
          await db.activity.write({
            boardId,
            actorId: actor.actorId,
            columnId: entity.id,
            action: "COLUMN_CREATED",
            metadata: { columnName: entity.name },
          });
          return {
            result: entity,
            event: { ...actor, boardId, type: "column.created", entity },
          };
        },
        true,
      );
    },
    rename(id: string, name: string, actor: Actor) {
      return mutate(deps, async (db) => {
        const { boardId } = await findColumn(db, id);
        await lockBoard(db, boardId, actor.actorId);
        const column = await findColumn(db, id);
        if (column.name === name) return { result: column };
        const entity = await db.columns.update(id, { name });
        await db.activity.write({
          boardId,
          actorId: actor.actorId,
          columnId: id,
          action: "COLUMN_RENAMED",
          metadata: { columnName: name, oldName: column.name },
        });
        return {
          result: entity,
          event: { ...actor, boardId, type: "column.updated", entity },
        };
      });
    },
    move(id: string, input: z.infer<typeof reorderSchema>, actor: Actor) {
      let gap: ReturnType<typeof captureGap> | undefined;
      return mutate(
        deps,
        async (db) => {
          const { boardId } = await findColumn(db, id);
          await requireMembership(db, boardId, actor.actorId);
          const siblings = async () =>
            (await db.columns.list(boardId)).filter(
              (column) => column.id !== id,
            );
          gap ??= captureGap(await siblings(), input);
          await lockBoard(db, boardId, actor.actorId);
          const column = await findColumn(db, id);
          const position = positionInGap(
            await siblings(),
            gap,
            column.position,
          );
          if (position === column.position) return { result: column };
          const entity = await db.columns.update(id, { position });
          await db.activity.write({
            boardId,
            actorId: actor.actorId,
            columnId: id,
            action: "COLUMN_REORDERED",
            metadata: {
              columnName: column.name,
              oldPosition: column.position,
              newPosition: position,
            },
          });
          return {
            result: entity,
            event: { ...actor, boardId, type: "column.moved", entity },
          };
        },
        true,
      );
    },
    remove(id: string, actor: Actor) {
      return mutate(deps, async (db) => {
        const { boardId } = await findColumn(db, id);
        await lockBoard(db, boardId, actor.actorId);
        const column = await findColumn(db, id);
        if (await db.cards.countInColumn(id))
          throw new AppError(
            409,
            "CONFLICT",
            "Move or delete the cards before deleting this column",
          );
        await db.activity.write({
          boardId,
          actorId: actor.actorId,
          columnId: id,
          action: "COLUMN_DELETED",
          metadata: { columnId: id, columnName: column.name },
        });
        await db.columns.remove(id);
        return {
          result: undefined,
          event: { ...actor, boardId, type: "column.deleted", entity: { id } },
        };
      });
    },
  };
}

export const columnService = createColumnService(boardDependencies);
