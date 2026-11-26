import type { z } from "zod";
import type { Card } from "@/shared/board";
import type {
  cardCreateSchema,
  cardMoveSchema,
  cardUpdateSchema,
} from "@/shared/kanban";
import { AppError, NotFoundError } from "../http/errors";
import type {
  ActivityInput,
  KanbanRepositories,
} from "../repositories/kanban.repository";
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

async function findCard(db: KanbanRepositories, id: string) {
  const card = await db.cards.find(id);
  if (!card) throw new NotFoundError("Resource not found");
  return card;
}

async function boardColumn(
  db: KanbanRepositories,
  columnId: string,
  boardId: string,
) {
  const column = await db.columns.find(columnId);
  if (!column || column.boardId !== boardId) {
    throw new AppError(
      422,
      "INVALID_COLUMN",
      "Column must belong to this board",
    );
  }
  return column;
}

async function assigneeName(
  db: KanbanRepositories,
  boardId: string,
  assigneeId: string | null,
) {
  if (assigneeId === null) return null;
  const member = await db.members.find(boardId, assigneeId);
  if (!member)
    throw new AppError(
      422,
      "INVALID_ASSIGNEE",
      "Assignee must be a board member",
    );
  return member.name;
}

async function cardChanges(
  db: KanbanRepositories,
  card: Card,
  input: z.infer<typeof cardUpdateSchema>,
) {
  const changes: ActivityInput["metadata"] = {};
  const patch: z.infer<typeof cardUpdateSchema> = {};
  for (const field of ["title", "priority"] as const) {
    const value = input[field];
    if (value !== undefined && value !== card[field]) {
      if (field === "title") patch.title = input.title;
      else patch.priority = input.priority;
      changes[field] = { old: card[field], new: value };
    }
  }
  if (
    input.description !== undefined &&
    input.description !== card.description
  ) {
    patch.description = input.description;
    changes.descriptionChanged = true;
  }
  if (input.assigneeId !== undefined && input.assigneeId !== card.assigneeId) {
    patch.assigneeId = input.assigneeId;
    const name = await assigneeName(db, card.boardId, input.assigneeId);
    const previous =
      card.assigneeId === null
        ? null
        : await db.members.find(card.boardId, card.assigneeId);
    changes.assignee = { old: previous?.name ?? null, new: name };
  }
  return { changes, patch };
}

export function createCardService(deps: BoardDependencies) {
  return {
    create(input: z.infer<typeof cardCreateSchema>, actor: Actor) {
      return mutate(
        deps,
        async (db) => {
          const target = await db.columns.find(input.columnId);
          if (!target) throw new NotFoundError("Resource not found");
          const { boardId } = target;
          await lockBoard(db, boardId, actor.actorId);
          const column = await boardColumn(db, input.columnId, boardId);
          enforceLimit(
            await db.cards.countOnBoard(boardId),
            500,
            "A board can have at most 500 cards",
          );
          await assigneeName(db, boardId, input.assigneeId ?? null);
          const position = appendPosition(
            await db.cards.list(boardId, column.id),
          );
          const entity = await db.cards.create({ ...input, boardId, position });
          await db.activity.write({
            boardId,
            actorId: actor.actorId,
            columnId: column.id,
            cardId: entity.id,
            action: "CARD_CREATED",
            metadata: { title: entity.title, columnName: column.name },
          });
          return {
            result: entity,
            event: { ...actor, boardId, type: "card.created", entity },
          };
        },
        true,
      );
    },
    update(id: string, input: z.infer<typeof cardUpdateSchema>, actor: Actor) {
      return mutate(deps, async (db) => {
        const { boardId } = await findCard(db, id);
        await lockBoard(db, boardId, actor.actorId);
        const card = await findCard(db, id);
        const column = await boardColumn(db, card.columnId, boardId);
        const { changes, patch } = await cardChanges(db, card, input);
        if (Object.keys(patch).length === 0) return { result: card };
        const entity = await db.cards.update(id, patch);
        await db.activity.write({
          boardId,
          actorId: actor.actorId,
          columnId: column.id,
          cardId: id,
          action: "CARD_UPDATED",
          metadata: {
            cardTitle: entity.title,
            columnName: column.name,
            ...changes,
          },
        });
        return {
          result: entity,
          event: { ...actor, boardId, type: "card.updated", entity },
        };
      });
    },
    move(id: string, input: z.infer<typeof cardMoveSchema>, actor: Actor) {
      let gap: ReturnType<typeof captureGap> | undefined;
      return mutate(
        deps,
        async (db) => {
          const { boardId } = await findCard(db, id);
          await requireMembership(db, boardId, actor.actorId);
          await boardColumn(db, input.columnId, boardId);
          const siblings = async () =>
            (await db.cards.list(boardId, input.columnId)).filter(
              (card) => card.id !== id,
            );
          gap ??= captureGap(await siblings(), input);
          await lockBoard(db, boardId, actor.actorId);
          const card = await findCard(db, id);
          const from = await boardColumn(db, card.columnId, boardId);
          const to = await boardColumn(db, input.columnId, boardId);
          const position = positionInGap(
            await siblings(),
            gap,
            from.id === to.id ? card.position : undefined,
          );
          if (from.id === to.id && position === card.position)
            return { result: card };
          const entity = await db.cards.update(id, {
            columnId: to.id,
            position,
          });
          await db.activity.write({
            boardId,
            actorId: actor.actorId,
            columnId: to.id,
            cardId: id,
            action: "CARD_MOVED",
            metadata: {
              title: card.title,
              fromColumnId: from.id,
              toColumnId: to.id,
              fromColumnName: from.name,
              toColumnName: to.name,
            },
          });
          return {
            result: entity,
            event: { ...actor, boardId, type: "card.moved", entity },
          };
        },
        true,
      );
    },
    remove(id: string, actor: Actor) {
      return mutate(deps, async (db) => {
        const { boardId } = await findCard(db, id);
        await lockBoard(db, boardId, actor.actorId);
        const card = await findCard(db, id);
        const column = await boardColumn(db, card.columnId, boardId);
        await db.activity.write({
          boardId,
          actorId: actor.actorId,
          columnId: column.id,
          cardId: id,
          action: "CARD_DELETED",
          metadata: {
            cardId: id,
            title: card.title,
            columnId: column.id,
            columnName: column.name,
          },
        });
        await db.cards.remove(id);
        return {
          result: undefined,
          event: { ...actor, boardId, type: "card.deleted", entity: { id } },
        };
      });
    },
  };
}

export const cardService = createCardService(boardDependencies);
