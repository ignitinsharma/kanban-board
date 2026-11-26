import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "../prisma/generated/client";
import * as boards from "../src/app/api/boards/route";
import * as board from "../src/app/api/boards/[boardId]/route";
import * as members from "../src/app/api/boards/[boardId]/members/route";
import * as columns from "../src/app/api/boards/[boardId]/columns/route";
import * as column from "../src/app/api/columns/[columnId]/route";
import * as columnMove from "../src/app/api/columns/[columnId]/move/route";
import * as cards from "../src/app/api/cards/route";
import * as card from "../src/app/api/cards/[cardId]/route";
import * as cardMove from "../src/app/api/cards/[cardId]/move/route";
import { POST as register } from "../src/app/api/auth/register/route";
import { sessionCookieName } from "../src/server/security/session-cookie";
import { signSession } from "../src/server/security/session";
import { boardEvents } from "../src/server/realtime/event-bus";
import { runInTransaction } from "../src/server/repositories/transaction";
import { createCardService } from "../src/server/services/card.service";
import type { Board, BoardDetail, Card, Column } from "../src/shared/board";
import type { PublicUser } from "../src/shared/auth";

const connectionString = process.env.TEST_DATABASE_URL;
const base = "http://localhost:3000";

function request(
  method: string,
  cookie?: string,
  body?: unknown,
  clientId?: string,
) {
  const headers = new Headers({ Origin: base });
  if (cookie) headers.set("Cookie", cookie);
  if (clientId) headers.set("X-Client-Id", clientId);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request(base, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function params<Key extends string>(key: Key, id: string) {
  return { params: Promise.resolve({ [key]: id } as Record<Key, string>) };
}

async function json<Result>(
  response: Response,
  status: number,
): Promise<Result> {
  expect(response.status).toBe(status);
  return response.json();
}

describe.skipIf(!connectionString)("Kanban API with PostgreSQL", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const emails: string[] = [];

  beforeAll(() => {
    vi.stubEnv("DATABASE_URL", connectionString);
    vi.stubEnv("JWT_SECRET", "kanban-db-test-secret-0123456789");
  });

  afterEach(async () => {
    await db.board.deleteMany({ where: { owner: { email: { in: emails } } } });
    await db.user.deleteMany({ where: { email: { in: emails } } });
    emails.length = 0;
  });

  afterAll(async () => {
    await db.$disconnect();
    vi.unstubAllEnvs();
  });

  async function user(name: string, throughAuth = false) {
    const email = `${randomUUID()}@example.com`;
    emails.push(email);
    if (throughAuth) {
      const response = await register(
        request("POST", undefined, { email, name, password: "test-password" }),
      );
      const user = await json<PublicUser>(response, 201);
      return {
        ...user,
        cookie: response.headers.get("set-cookie")!.split(";")[0],
      };
    }
    const user = await db.user.create({
      data: { name, email, passwordHash: "fixture" },
    });
    return {
      id: user.id,
      name,
      email,
      cookie: `${sessionCookieName}=${await signSession(user.id)}`,
    };
  }

  async function createBoard(cookie: string) {
    return json<BoardDetail>(
      await boards.POST(request("POST", cookie, { name: "Project" })),
      201,
    );
  }

  async function createCard(cookie: string, columnId: string, title: string) {
    return json<Card>(
      await cards.POST(request("POST", cookie, { columnId, title })),
      201,
    );
  }

  it("runs the board, membership, column and card lifecycle and preserves activity snapshots", async () => {
    const owner = await user("Owner", true);
    const collaborator = await user("Collaborator", true);
    const project = await createBoard(owner.cookie);
    const ctx = params("boardId", project.id);
    expect(project.members).toEqual([
      { id: owner.id, name: owner.name, email: owner.email },
    ]);
    expect(project.columns.map(({ name }) => name)).toEqual([
      "Backlog",
      "In Progress",
      "In Review",
      "Done",
    ]);
    expect(await db.activityLog.count({ where: { boardId: project.id } })).toBe(
      0,
    );
    expect(
      await json(await boards.GET(request("GET", collaborator.cookie)), 200),
    ).toEqual([]);
    const added = await members.POST(
      request("POST", owner.cookie, { email: collaborator.email }),
      ctx,
    );
    expect(await json(added, 201)).toEqual({
      id: collaborator.id,
      name: collaborator.name,
      email: collaborator.email,
    });

    expect(
      await json(
        await board.PATCH(
          request("PATCH", collaborator.cookie, { name: "Renamed" }),
          ctx,
        ),
        200,
      ),
    ).toMatchObject({ name: "Renamed" });
    expect(
      (await board.DELETE(request("DELETE", collaborator.cookie), ctx)).status,
    ).toBe(403);

    const extra = await json<Column>(
      await columns.POST(
        request("POST", collaborator.cookie, { name: "Extra" }),
        ctx,
      ),
      201,
    );
    const columnCtx = params("columnId", extra.id);
    expect(
      await json(
        await column.PATCH(
          request("PATCH", owner.cookie, { name: "Review Queue" }),
          columnCtx,
        ),
        200,
      ),
    ).toMatchObject({ name: "Review Queue" });
    expect(
      (
        await columnMove.PATCH(
          request("PATCH", collaborator.cookie, {
            previousId: null,
            nextId: project.columns[0].id,
          }),
          columnCtx,
        )
      ).status,
    ).toBe(200);

    const issue = await createCard(
      collaborator.cookie,
      project.columns[0].id,
      "Draft",
    );
    const issueCtx = params("cardId", issue.id);
    expect(
      (
        await column.DELETE(
          request("DELETE", owner.cookie),
          params("columnId", issue.columnId),
        )
      ).status,
    ).toBe(409);
    const listener = vi.fn();
    const stop = boardEvents.subscribe(project.id, listener);
    const clientId = randomUUID();
    try {
      const updated = await card.PATCH(
        request(
          "PATCH",
          owner.cookie,
          {
            title: "Edited",
            assigneeId: collaborator.id,
            description: "secret draft",
          },
          clientId,
        ),
        issueCtx,
      );
      const entity = await json<Card>(updated, 200);
      expect(entity).toMatchObject({
        title: "Edited",
        assigneeId: collaborator.id,
      });
      expect(listener).toHaveBeenCalledWith({
        type: "card.updated",
        boardId: project.id,
        actorId: owner.id,
        originClientId: clientId,
        entity,
      });
      const noOp = await card.PATCH(
        request("PATCH", owner.cookie, { title: "Edited" }),
        issueCtx,
      );
      expect(await json(noOp, 200)).toEqual(entity);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }

    const moved = await cardMove.PATCH(
      request("PATCH", collaborator.cookie, {
        columnId: extra.id,
        previousId: null,
        nextId: null,
      }),
      issueCtx,
    );
    expect(await json(moved, 200)).toMatchObject({ columnId: extra.id });
    const detail = await json<BoardDetail>(
      await board.GET(request("GET", owner.cookie), ctx),
      200,
    );
    expect(detail.columns[0].id).toBe(extra.id);
    expect(detail.cards.map(({ id }) => id)).toEqual([issue.id]);
    expect(JSON.stringify(detail)).not.toContain("passwordHash");
    expect(detail.members.map(({ email }) => email).sort()).toEqual(
      [owner.email, collaborator.email].sort(),
    );

    expect(
      (await card.DELETE(request("DELETE", owner.cookie), issueCtx)).status,
    ).toBe(204);
    expect(
      (await column.DELETE(request("DELETE", collaborator.cookie), columnCtx))
        .status,
    ).toBe(204);
    const history = await db.activityLog.findMany({
      where: { boardId: project.id },
    });
    expect(history.map(({ action }) => action).sort()).toEqual(
      [
        "MEMBER_ADDED",
        "COLUMN_CREATED",
        "COLUMN_RENAMED",
        "COLUMN_REORDERED",
        "CARD_CREATED",
        "CARD_UPDATED",
        "CARD_MOVED",
        "CARD_DELETED",
        "COLUMN_DELETED",
      ].sort(),
    );
    const logged = (action: string) =>
      history.find((row) => row.action === action);
    expect(logged("MEMBER_ADDED")?.metadata).toMatchObject({
      name: collaborator.name,
      email: collaborator.email,
    });
    expect(logged("CARD_UPDATED")?.metadata).toMatchObject({
      descriptionChanged: true,
      assignee: { old: null, new: collaborator.name },
    });
    expect(JSON.stringify(history)).not.toContain("secret draft");
    expect(logged("CARD_MOVED")).toMatchObject({
      cardId: null,
      columnId: null,
      metadata: {
        title: "Edited",
        fromColumnName: "Backlog",
        toColumnName: "Review Queue",
      },
    });
    expect(logged("CARD_DELETED")).toMatchObject({
      cardId: null,
      columnId: null,
      metadata: {
        cardId: issue.id,
        title: "Edited",
        columnName: "Review Queue",
      },
    });
    expect(logged("COLUMN_DELETED")).toMatchObject({
      columnId: null,
      metadata: { columnId: extra.id, columnName: "Review Queue" },
    });
    expect(
      (await board.DELETE(request("DELETE", owner.cookie), ctx)).status,
    ).toBe(204);
  });

  it("returns the same 404 for unauthorized and missing resources across every scoped route", async () => {
    const owner = await user("Owner");
    const outsider = await user("Outsider");
    const project = await createBoard(owner.cookie);
    const other = await createBoard(outsider.cookie);
    const col = project.columns[0];
    const issue = await createCard(owner.cookie, col.id, "Private");
    const missing = randomUUID();
    const gap = { previousId: null, nextId: null };
    const action = (method: string, body?: unknown) =>
      request(method, outsider.cookie, body);
    const checks = [
      (id: string) => board.GET(action("GET"), params("boardId", id)),
      (id: string) =>
        board.PATCH(action("PATCH", { name: "X" }), params("boardId", id)),
      (id: string) => board.DELETE(action("DELETE"), params("boardId", id)),
      (id: string) =>
        members.POST(
          action("POST", { email: outsider.email }),
          params("boardId", id),
        ),
      (id: string) =>
        columns.POST(action("POST", { name: "X" }), params("boardId", id)),
      (id: string) =>
        column.PATCH(action("PATCH", { name: "X" }), params("columnId", id)),
      (id: string) =>
        columnMove.PATCH(action("PATCH", gap), params("columnId", id)),
      (id: string) => column.DELETE(action("DELETE"), params("columnId", id)),
      (id: string) => cards.POST(action("POST", { columnId: id, title: "X" })),
      (id: string) =>
        card.PATCH(action("PATCH", { title: "X" }), params("cardId", id)),
      (id: string) =>
        cardMove.PATCH(
          action("PATCH", { ...gap, columnId: other.columns[0].id }),
          params("cardId", id),
        ),
      (id: string) => card.DELETE(action("DELETE"), params("cardId", id)),
    ];
    const ids = [
      ...Array(5).fill(project.id),
      ...Array(4).fill(col.id),
      ...Array(3).fill(issue.id),
    ];
    for (const [index, check] of checks.entries()) {
      expect(await json(await check(ids[index]), 404)).toEqual(
        await json(await check(missing), 404),
      );
    }

    const crossMove = await cardMove.PATCH(
      request("PATCH", owner.cookie, { ...gap, columnId: other.columns[0].id }),
      params("cardId", issue.id),
    );
    expect(await json(crossMove, 422)).toMatchObject({
      error: { code: "INVALID_COLUMN" },
    });
    const assign = await card.PATCH(
      request("PATCH", owner.cookie, { assigneeId: outsider.id }),
      params("cardId", issue.id),
    );
    expect(await json(assign, 422)).toMatchObject({
      error: { code: "INVALID_ASSIGNEE" },
    });
    expect(
      (await board.GET(request("GET"), params("boardId", project.id))).status,
    ).toBe(401);
    expect(
      (
        await board.GET(
          request("GET", owner.cookie),
          params("boardId", "invalid"),
        )
      ).status,
    ).toBe(400);
    const visible = await json<BoardDetail>(
      await board.GET(
        request("GET", owner.cookie),
        params("boardId", project.id),
      ),
      200,
    );
    expect(JSON.stringify(visible)).not.toContain(outsider.email);
    expect(visible.cards[0]).toMatchObject({
      id: issue.id,
      title: "Private",
      columnId: col.id,
    });
  });

  it("commits two overlapping moves into the same gap with distinct ordered positions", async () => {
    const owner = await user("Owner");
    const project = await createBoard(owner.cookie);
    const [source, target] = project.columns;
    const left = await createCard(owner.cookie, target.id, "Left");
    const right = await createCard(owner.cookie, target.id, "Right");
    const first = await createCard(owner.cookie, source.id, "First");
    const second = await createCard(owner.cookie, source.id, "Second");
    const { promise, resolve } = Promise.withResolvers<void>();
    let arrived = 0;
    const service = createCardService({
      events: boardEvents,
      transaction: (work) =>
        runInTransaction((repos) => {
          let checked = false;
          return work({
            ...repos,
            cards: {
              ...repos.cards,
              async list(boardId, columnId) {
                const result = await repos.cards.list(boardId, columnId);
                if (!checked) {
                  checked = true;
                  arrived += 1;
                  if (arrived === 2) resolve();
                  await promise;
                }
                return result;
              },
            },
          });
        }),
    });
    const move = { columnId: target.id, previousId: left.id, nextId: right.id };
    const actor = { actorId: owner.id, originClientId: null };
    const moved = await Promise.all([
      service.move(first.id, move, actor),
      service.move(second.id, move, actor),
    ]);
    expect(new Set(moved.map(({ position }) => position)).size).toBe(2);
    const final = await db.card.findMany({
      where: { columnId: target.id },
      orderBy: { position: "asc" },
    });
    expect(final.map(({ id }) => id)).toEqual([
      left.id,
      ...moved
        .sort((a, b) => (a.position < b.position ? -1 : 1))
        .map(({ id }) => id),
      right.id,
    ]);
    const stale = await cardMove.PATCH(
      request("PATCH", owner.cookie, move),
      params("cardId", first.id),
    );
    expect(await json(stale, 409)).toMatchObject({
      error: { code: "STALE_ORDER" },
    });
  });
  it("lists owned and joined boards and excludes unrelated boards", async () => {
    const caller = await user("Caller");
    const owner = await user("Other owner");
    const own = await createBoard(caller.cookie);
    const joined = await createBoard(owner.cookie);
    await createBoard(owner.cookie);
    expect(
      (
        await members.POST(
          request("POST", owner.cookie, { email: caller.email }),
          params("boardId", joined.id),
        )
      ).status,
    ).toBe(201);
    const visible = await json<Board[]>(
      await boards.GET(request("GET", caller.cookie)),
      200,
    );
    expect(visible.map(({ id }) => id).sort()).toEqual(
      [own.id, joined.id].sort(),
    );
  });

  it("returns columns and their cards in byte-wise fractional position order", async () => {
    const owner = await user("Owner");
    const project = await createBoard(owner.cookie);
    const keys = ["a0A", "a0Z", "a0a"];
    await db.column.deleteMany({ where: { boardId: project.id } });
    for (const position of [...keys].reverse()) {
      const created = await db.column.create({
        data: { boardId: project.id, name: position, position },
      });
      await db.card.createMany({
        data: [...keys]
          .reverse()
          .map((key) => ({
            boardId: project.id,
            columnId: created.id,
            position: key,
            title: key,
          })),
      });
    }
    const visible = await json<BoardDetail>(
      await board.GET(
        request("GET", owner.cookie),
        params("boardId", project.id),
      ),
      200,
    );
    expect(visible.columns.map(({ position }) => position)).toEqual(keys);
    expect(
      visible.cards.map(({ columnId, position }) => [columnId, position]),
    ).toEqual(
      visible.columns.flatMap(({ id }) => keys.map((key) => [id, key])),
    );
  });

  it("drops malformed origin IDs and forwards valid UUIDs on published events", async () => {
    const owner = await user("Owner");
    const project = await createBoard(owner.cookie);
    const listener = vi.fn();
    const stop = boardEvents.subscribe(project.id, listener);
    const clientId = randomUUID();
    try {
      for (const [name, origin] of [
        ["First", "malformed"],
        ["Second", clientId],
      ]) {
        expect(
          (
            await board.PATCH(
              request("PATCH", owner.cookie, { name }, origin),
              params("boardId", project.id),
            )
          ).status,
        ).toBe(200);
      }
      expect(
        listener.mock.calls.map(([event]) => event.originClientId),
      ).toEqual([null, clientId]);
    } finally {
      stop();
    }
  });

  it("rolls back the card update when PostgreSQL rejects the activity insert", async () => {
    const owner = await user("Owner");
    const project = await createBoard(owner.cookie);
    const issue = await createCard(
      owner.cookie,
      project.columns[0].id,
      "Original",
    );
    const listener = vi.fn();
    const stop = boardEvents.subscribe(project.id, listener);
    const missingActor = randomUUID();
    const service = createCardService({
      events: boardEvents,
      transaction: (work) =>
        runInTransaction((repos) =>
          work({
            ...repos,
            activity: {
              write: (data) =>
                repos.activity.write({ ...data, actorId: missingActor }),
            },
          }),
        ),
    });
    try {
      await expect(
        service.update(
          issue.id,
          { title: "Uncommitted" },
          {
            actorId: owner.id,
            originClientId: null,
          },
        ),
      ).rejects.toMatchObject({ code: "P2003" });
      const restored = await db.card.findUniqueOrThrow({
        where: { id: issue.id },
      });
      expect(restored.title).toBe("Original");
      expect(restored.updatedAt.toISOString()).toBe(issue.updatedAt);
      expect(
        await db.activityLog.count({
          where: { cardId: issue.id, action: "CARD_UPDATED" },
        }),
      ).toBe(0);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it("leaves activity and events unchanged on a no-op column rename", async () => {
    const owner = await user("Owner");
    const project = await createBoard(owner.cookie);
    const before = project.columns[0];
    const listener = vi.fn();
    const stop = boardEvents.subscribe(project.id, listener);
    try {
      const response = await column.PATCH(
        request("PATCH", owner.cookie, { name: before.name }),
        params("columnId", before.id),
      );
      expect(await json(response, 200)).toEqual(before);
      expect(
        await db.activityLog.count({ where: { boardId: project.id } }),
      ).toBe(0);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
});
