import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/boards/[boardId]/events/route";
import { PrismaClient } from "../prisma/generated/client";
import { sessionCookieName } from "../src/server/security/session-cookie";
import { signSession } from "../src/server/security/session";
import { boardService } from "../src/server/services/board.service";
import {
  boardDependencies,
  mutate,
} from "../src/server/services/board-context";

const connectionString = process.env.TEST_DATABASE_URL;
const base = "http://localhost";

describe.skipIf(!connectionString)("PostgreSQL board event stream", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const users: string[] = [];

  beforeAll(() => {
    vi.stubEnv("DATABASE_URL", connectionString);
    vi.stubEnv("JWT_SECRET", "sse-test-only-secret-012345678901234");
  });

  afterAll(async () => {
    await db.board.deleteMany({ where: { ownerId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
    vi.unstubAllEnvs();
  });

  async function createUser() {
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        name: "Fixture",
        passwordHash: "fixture",
      },
    });
    users.push(user.id);
    return {
      actorId: user.id,
      originClientId: null,
      cookie: `${sessionCookieName}=${await signSession(user.id)}`,
    };
  }

  function open(boardId: string, cookie?: string, signal?: AbortSignal) {
    return GET(
      new Request(base, { headers: cookie ? { Cookie: cookie } : {}, signal }),
      {
        params: Promise.resolve({ boardId }),
      },
    );
  }

  it("authorizes by board, streams committed service events and closes on deletion", async () => {
    const { cookie, ...actor } = await createUser();
    const other = await createUser();
    const board = await boardService.create("Project", actor);
    const separate = await boardService.create("Other project", other);
    expect((await open(board.id)).status).toBe(401);
    const denied = await open(board.id, other.cookie);
    const absent = await open(randomUUID(), other.cookie);
    expect(denied.status).toBe(404);
    expect(absent.status).toBe(404);
    expect(await denied.json()).toEqual(await absent.json());

    const abort = new AbortController();
    const response = await open(board.id, cookie, abort.signal);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    try {
      expect(decoder.decode((await reader.read()).value)).toContain(
        ": connected",
      );
      await boardService.rename(separate.id, "Other rename", other);
      await expect(
        mutate(boardDependencies, async (repos) => {
          await repos.boards.rename(board.id, "Rollback");
          throw new Error("forced rollback");
        }),
      ).rejects.toThrow("forced rollback");
      await boardService.rename(board.id, "Committed", actor);
      const frame = decoder.decode((await reader.read()).value);
      expect(frame).toMatch(/^event: board\.updated\ndata: /);
      expect(frame).toContain("Committed");
      expect(frame).not.toContain("Rollback");
      expect(frame).not.toContain("Other rename");
      await boardService.remove(board.id, actor);
      expect(decoder.decode((await reader.read()).value)).toContain(
        "event: board.deleted",
      );
      expect((await reader.read()).done).toBe(true);
    } finally {
      abort.abort();
      await reader.cancel();
    }
  });

  it("returns 429 with Retry-After and reuses capacity on abort", async () => {
    const actor = await createUser();
    const board = await boardService.create("Project", actor);
    const controllers = Array.from({ length: 4 }, () => new AbortController());
    try {
      for (const controller of controllers.slice(0, 3)) {
        expect(
          (await open(board.id, actor.cookie, controller.signal)).status,
        ).toBe(200);
      }
      const limited = await open(board.id, actor.cookie);
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBe("10");
      controllers[0].abort();
      expect(
        (await open(board.id, actor.cookie, controllers[3].signal)).status,
      ).toBe(200);
    } finally {
      for (const controller of controllers) controller.abort();
    }
  });
});
