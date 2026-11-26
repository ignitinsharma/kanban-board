import type { ActivityEntry } from "@/shared/activity";
import type { Board, BoardMember, Card, Column } from "@/shared/board";
import type { ActivityAction } from "@/shared/kanban";
import { getPrisma } from "../db/prisma";

type Database = Pick<
  ReturnType<typeof getPrisma>,
  | "board"
  | "boardMember"
  | "column"
  | "card"
  | "activityLog"
  | "user"
  | "$queryRaw"
>;
export type ActivityInput = {
  boardId: string;
  actorId: string;
  action: ActivityAction;
  cardId?: string;
  columnId?: string;
  metadata: Record<
    string,
    string | boolean | null | { old: string | null; new: string | null }
  >;
};

type DateFields = { createdAt: Date; updatedAt: Date };
function timestamps(row: DateFields) {
  return {
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function boardDto(row: Omit<Board, keyof DateFields> & DateFields): Board {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    ...timestamps(row),
  };
}

function columnDto(row: Omit<Column, keyof DateFields> & DateFields): Column {
  return {
    id: row.id,
    boardId: row.boardId,
    name: row.name,
    position: row.position,
    ...timestamps(row),
  };
}

function cardDto(row: Omit<Card, keyof DateFields> & DateFields): Card {
  return {
    id: row.id,
    boardId: row.boardId,
    columnId: row.columnId,
    title: row.title,
    description: row.description,
    priority: row.priority,
    assigneeId: row.assigneeId,
    position: row.position,
    ...timestamps(row),
  };
}

const publicUser = { id: true, name: true, email: true } as const;
type CardFields = Pick<
  Card,
  "title" | "description" | "priority" | "assigneeId"
>;
type CardCreate = Pick<Card, "boardId" | "columnId" | "position" | "title"> &
  Partial<CardFields>;
type CardPatch = Partial<CardFields & Pick<Card, "columnId" | "position">>;

export function createRepositories(db: Database) {
  return {
    boards: {
      async find(id: string) {
        const row = await db.board.findUnique({ where: { id } });
        return row && boardDto(row);
      },
      async list(userId: string) {
        return (
          await db.board.findMany({
            where: { members: { some: { userId } } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          })
        ).map(boardDto);
      },
      countOwned: (ownerId: string) => db.board.count({ where: { ownerId } }),
      async lock(id: string) {
        await db.$queryRaw`SELECT id FROM "Board" WHERE id = ${id}::uuid FOR UPDATE`;
      },
      async lockForRead(id: string) {
        await db.$queryRaw`SELECT id FROM "Board" WHERE id = ${id}::uuid FOR SHARE`;
      },
      async lockOwner(id: string) {
        await db.$queryRaw`SELECT id FROM "User" WHERE id = ${id}::uuid FOR UPDATE`;
      },
      async create(ownerId: string, name: string) {
        return boardDto(await db.board.create({ data: { ownerId, name } }));
      },
      async rename(id: string, name: string) {
        return boardDto(
          await db.board.update({ where: { id }, data: { name } }),
        );
      },
      async remove(id: string) {
        await db.board.delete({ where: { id } });
      },
    },
    members: {
      async find(boardId: string, userId: string): Promise<BoardMember | null> {
        const row = await db.boardMember.findUnique({
          where: { boardId_userId: { boardId, userId } },
          select: { user: { select: publicUser } },
        });
        return row?.user ?? null;
      },
      async list(boardId: string): Promise<BoardMember[]> {
        return (
          await db.boardMember.findMany({
            where: { boardId },
            select: { user: { select: publicUser } },
            orderBy: { userId: "asc" },
          })
        ).map(({ user }) => user);
      },
      count: (boardId: string) => db.boardMember.count({ where: { boardId } }),
      findUser: (email: string): Promise<BoardMember | null> =>
        db.user.findUnique({ where: { email }, select: publicUser }),
      async add(boardId: string, userId: string) {
        await db.boardMember.create({ data: { boardId, userId } });
      },
    },
    columns: {
      async find(id: string) {
        const row = await db.column.findUnique({ where: { id } });
        return row && columnDto(row);
      },
      async list(boardId: string) {
        return (
          await db.column.findMany({
            where: { boardId },
            orderBy: { position: "asc" },
          })
        ).map(columnDto);
      },
      async create(boardId: string, name: string, position: string) {
        return columnDto(
          await db.column.create({ data: { boardId, name, position } }),
        );
      },
      async update(
        id: string,
        data: Partial<Pick<Column, "name" | "position">>,
      ) {
        return columnDto(await db.column.update({ where: { id }, data }));
      },
      async remove(id: string) {
        await db.column.delete({ where: { id } });
      },
    },
    cards: {
      async find(id: string) {
        const row = await db.card.findUnique({ where: { id } });
        return row && cardDto(row);
      },
      async list(boardId: string, columnId?: string) {
        return (
          await db.card.findMany({
            where: { boardId, columnId },
            orderBy: { position: "asc" },
          })
        ).map(cardDto);
      },
      countOnBoard: (boardId: string) => db.card.count({ where: { boardId } }),
      countInColumn: (columnId: string) =>
        db.card.count({ where: { columnId } }),
      async create(data: CardCreate) {
        return cardDto(await db.card.create({ data }));
      },
      async update(id: string, data: CardPatch) {
        return cardDto(await db.card.update({ where: { id }, data }));
      },
      async remove(id: string) {
        await db.card.delete({ where: { id } });
      },
    },
    activity: {
      async list(
        boardId: string,
        take: number,
        cursor?: { createdAt: Date; id: string },
      ): Promise<ActivityEntry[]> {
        const rows = await db.activityLog.findMany({
          where: {
            boardId,
            ...(cursor && {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }),
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take,
          select: {
            id: true,
            action: true,
            createdAt: true,
            cardId: true,
            columnId: true,
            metadata: true,
            actor: { select: { id: true, name: true } },
          },
        });
        return rows.map(({ createdAt, metadata, ...row }) => ({
          ...row,
          createdAt: createdAt.toISOString(),
          metadata:
            metadata && typeof metadata === "object" && !Array.isArray(metadata)
              ? metadata
              : {},
        }));
      },
      async write(data: ActivityInput) {
        await db.activityLog.create({ data });
      },
    },
  };
}

export type KanbanRepositories = ReturnType<typeof createRepositories>;
