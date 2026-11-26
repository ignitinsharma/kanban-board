import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateNKeysBetween } from "fractional-indexing";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "../prisma/generated/client";

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(!connectionString)("PostgreSQL schema", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const userIds: string[] = [];
  const boardIds: string[] = [];

  async function createUser() {
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        name: "User",
        passwordHash: "fixture",
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createBoard() {
    const owner = await createUser();
    const board = await db.board.create({
      data: {
        name: "Board",
        ownerId: owner.id,
        members: { create: { userId: owner.id } },
      },
    });
    boardIds.push(board.id);
    return board;
  }

  afterEach(async () => {
    await db.board.deleteMany({ where: { id: { in: boardIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    boardIds.length = 0;
    userIds.length = 0;
  });

  afterAll(() => db.$disconnect());

  it("enforces normalized unique email and unique membership", async () => {
    const board = await createBoard();
    const owner = await db.user.findUniqueOrThrow({
      where: { id: board.ownerId },
    });
    const data = { name: owner.name, passwordHash: owner.passwordHash };
    await expect(
      db.user.create({ data: { ...data, email: owner.email } }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      db.user.create({ data: { ...data, email: owner.email.toUpperCase() } }),
    ).rejects.toThrow(/User_email_lowercase_check/);
    await expect(
      db.boardMember.create({ data: { boardId: board.id, userId: owner.id } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("orders fractional keys byte-wise and enforces scoped uniqueness", async () => {
    const collations = await db.$queryRaw<
      { tableName: string; collation: string }[]
    >`
      SELECT tbl.relname AS "tableName", coll.collname AS "collation"
      FROM pg_attribute AS attr
      JOIN pg_class AS tbl ON tbl.oid = attr.attrelid
      JOIN pg_collation AS coll ON coll.oid = attr.attcollation
      JOIN pg_namespace AS ns ON ns.oid = coll.collnamespace
      WHERE tbl.oid IN ('public."Card"'::regclass, 'public."Column"'::regclass)
        AND attr.attname = 'position' AND ns.nspname = 'pg_catalog'
      ORDER BY tbl.relname
    `;
    expect(collations).toEqual([
      { tableName: "Card", collation: "C" },
      { tableName: "Column", collation: "C" },
    ]);

    const board = await createBoard();
    const otherBoard = await createBoard();
    const keys = generateNKeysBetween("a0", "a1", 80);
    const reversed = [...keys].reverse();
    await db.column.createMany({
      data: reversed.map((position) => ({
        boardId: board.id,
        name: "Column",
        position,
      })),
    });
    const columns = await db.column.findMany({
      where: { boardId: board.id },
      orderBy: { position: "asc" },
    });
    expect(columns.map(({ position }) => position)).toEqual(keys);

    const columnData = {
      boardId: board.id,
      name: "Duplicate",
      position: keys[0],
    };
    await expect(db.column.create({ data: columnData })).rejects.toMatchObject({
      code: "P2002",
    });
    await db.column.create({ data: { ...columnData, boardId: otherBoard.id } });

    const cardData = {
      boardId: board.id,
      columnId: columns[0].id,
      title: "Card",
    };
    await db.card.createMany({
      data: reversed.map((position) => ({ ...cardData, position })),
    });
    const cards = await db.card.findMany({
      where: { columnId: columns[0].id },
      orderBy: { position: "asc" },
    });
    expect(cards.map(({ position }) => position)).toEqual(keys);
    expect(cards[0]).toMatchObject({
      priority: "MEDIUM",
      description: null,
      assigneeId: null,
    });

    await expect(
      db.card.create({ data: { ...cardData, position: keys[0] } }),
    ).rejects.toMatchObject({ code: "P2002" });
    await db.card.create({
      data: { ...cardData, columnId: columns[1].id, position: keys[0] },
    });
  });

  it("preserves activity snapshots and applies deletion rules", async () => {
    const board = await createBoard();
    const actor = await createUser();
    const assignee = await createUser();
    await db.boardMember.createMany({
      data: [actor, assignee].map(({ id }) => ({
        boardId: board.id,
        userId: id,
      })),
    });
    const column = await db.column.create({
      data: { boardId: board.id, name: "Doing", position: "a0" },
    });
    const cardData = { boardId: board.id, columnId: column.id, title: "Card" };
    const card = await db.card.create({
      data: { ...cardData, position: "a0", assigneeId: assignee.id },
    });
    const remaining = await db.card.create({
      data: { ...cardData, position: "a1" },
    });
    const metadata = {
      cardId: card.id,
      title: card.title,
      columnName: column.name,
    };
    const event = await db.activityLog.create({
      data: {
        boardId: board.id,
        actorId: actor.id,
        columnId: column.id,
        cardId: card.id,
        action: "CARD_DELETED",
        metadata,
      },
    });

    await expect(
      db.user.delete({ where: { id: board.ownerId } }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      db.user.delete({ where: { id: actor.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
    await db.user.delete({ where: { id: assignee.id } });
    expect(await db.boardMember.count({ where: { userId: assignee.id } })).toBe(
      0,
    );
    expect(
      await db.card.findUniqueOrThrow({ where: { id: card.id } }),
    ).toMatchObject({ assigneeId: null });

    await db.card.delete({ where: { id: card.id } });
    expect(
      await db.activityLog.findUniqueOrThrow({ where: { id: event.id } }),
    ).toMatchObject({
      cardId: null,
      columnId: column.id,
      actorId: actor.id,
      metadata,
    });
    const remainingEvent = await db.activityLog.create({
      data: {
        boardId: board.id,
        actorId: actor.id,
        columnId: column.id,
        cardId: remaining.id,
        action: "CARD_CREATED",
        metadata: { title: remaining.title },
      },
    });

    await db.column.delete({ where: { id: column.id } });
    expect(await db.card.count({ where: { id: remaining.id } })).toBe(0);
    expect(
      await db.activityLog.findUniqueOrThrow({
        where: { id: remainingEvent.id },
      }),
    ).toMatchObject({
      cardId: null,
      columnId: null,
      metadata: { title: remaining.title },
    });

    const lastColumn = await db.column.create({
      data: { boardId: board.id, name: "Done", position: "a0" },
    });
    await db.card.create({
      data: { ...cardData, columnId: lastColumn.id, position: "a0" },
    });
    await db.board.delete({ where: { id: board.id } });
    expect(await db.boardMember.count({ where: { boardId: board.id } })).toBe(
      0,
    );
    expect(await db.column.count({ where: { boardId: board.id } })).toBe(0);
    expect(await db.card.count({ where: { boardId: board.id } })).toBe(0);
    expect(await db.activityLog.count({ where: { boardId: board.id } })).toBe(
      0,
    );
    expect(
      await db.user.count({ where: { id: { in: [board.ownerId, actor.id] } } }),
    ).toBe(2);
  });

  it("pages activity across identical timestamps", async () => {
    const board = await createBoard();
    const createdAt = new Date("2026-01-01T12:00:00.000Z");
    const ids = Array.from({ length: 4 }, () => randomUUID())
      .sort()
      .reverse();
    await db.activityLog.createMany({
      data: ids.map((id) => ({
        id,
        boardId: board.id,
        actorId: board.ownerId,
        action: "COLUMN_CREATED",
        metadata: {},
        createdAt,
      })),
    });
    const orderBy = [{ createdAt: "desc" }, { id: "desc" }] as const;
    const first = await db.activityLog.findMany({
      where: { boardId: board.id },
      orderBy: [...orderBy],
      take: 2,
    });
    const cursor = first[1];
    const second = await db.activityLog.findMany({
      where: {
        boardId: board.id,
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      },
      orderBy: [...orderBy],
      take: 2,
    });
    expect([...first, ...second].map(({ id }) => id)).toEqual(ids);
  });
});
