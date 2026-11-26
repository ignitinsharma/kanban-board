import { generateNKeysBetween } from "fractional-indexing";
import type { BoardDetail } from "@/shared/board";
import { AppError, NotFoundError } from "../http/errors";
import {
  boardDependencies,
  enforceLimit,
  lockBoard,
  mutate,
  requireMembership,
  type Actor,
  type BoardDependencies,
} from "./board-context";

const defaultColumns = ["Backlog", "In Progress", "In Review", "Done"];

export function createBoardService(deps: BoardDependencies) {
  return {
    list(actorId: string) {
      return deps.transaction((db) => db.boards.list(actorId));
    },
    get(boardId: string, actorId: string): Promise<BoardDetail> {
      return deps.transaction(async (db) => {
        await requireMembership(db, boardId, actorId);
        await db.boards.lockForRead(boardId);
        const board = await db.boards.find(boardId);
        if (!board) throw new NotFoundError("Resource not found");
        const members = await db.members.list(boardId);
        const columns = await db.columns.list(boardId);
        const cards = await db.cards.list(boardId);
        const cardsByColumn = new Map<string, typeof cards>();
        for (const card of cards) {
          const group = cardsByColumn.get(card.columnId) ?? [];
          group.push(card);
          cardsByColumn.set(card.columnId, group);
        }
        return {
          ...board,
          members,
          columns,
          cards: columns.flatMap(({ id }) => cardsByColumn.get(id) ?? []),
        };
      });
    },
    create(name: string, actor: Actor): Promise<BoardDetail> {
      return mutate(deps, async (db) => {
        await db.boards.lockOwner(actor.actorId);
        enforceLimit(
          await db.boards.countOwned(actor.actorId),
          20,
          "You can own at most 20 boards",
        );
        const board = await db.boards.create(actor.actorId, name);
        await db.members.add(board.id, actor.actorId);
        const positions = generateNKeysBetween(
          null,
          null,
          defaultColumns.length,
        );
        const columns = [];
        for (const [index, column] of defaultColumns.entries()) {
          columns.push(
            await db.columns.create(board.id, column, positions[index]),
          );
        }
        return {
          result: {
            ...board,
            members: await db.members.list(board.id),
            columns,
            cards: [],
          },
        };
      });
    },
    rename(boardId: string, name: string, actor: Actor) {
      return mutate(deps, async (db) => {
        await lockBoard(db, boardId, actor.actorId);
        const board = await db.boards.find(boardId);
        if (!board) throw new NotFoundError("Resource not found");
        if (board.name === name) return { result: board };
        const entity = await db.boards.rename(boardId, name);
        return {
          result: entity,
          event: { ...actor, boardId, type: "board.updated", entity },
        };
      });
    },
    remove(boardId: string, actor: Actor) {
      return mutate(deps, async (db) => {
        await lockBoard(db, boardId, actor.actorId);
        const board = await db.boards.find(boardId);
        if (!board) throw new NotFoundError("Resource not found");
        if (board.ownerId !== actor.actorId)
          throw new AppError(
            403,
            "FORBIDDEN",
            "Only the owner can delete the board",
          );
        await db.boards.remove(boardId);
        return {
          result: undefined,
          event: {
            ...actor,
            boardId,
            type: "board.deleted",
            entity: { id: boardId },
          },
        };
      });
    },
  };
}

export const boardService = createBoardService(boardDependencies);
