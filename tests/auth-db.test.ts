import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../prisma/generated/client";
import { POST as register } from "../src/app/api/auth/register/route";
import { POST as login } from "../src/app/api/auth/login/route";
import { POST as logout } from "../src/app/api/auth/logout/route";
import { GET as me } from "../src/app/api/auth/me/route";

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(!connectionString)("auth routes with PostgreSQL", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const email = `${randomUUID()}@example.com`;
  const password = "test-password";
  const origin = "http://localhost:3000";

  beforeAll(() => {
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("DATABASE_URL", connectionString);
    vi.stubEnv("JWT_SECRET", "test-secret-0123456789-0123456789");
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
    vi.unstubAllEnvs();
  });

  function post(
    route: string,
    body?: unknown,
    from = origin,
    ip = "192.0.2.1",
  ) {
    return new Request(`${origin}/api/auth/${route}`, {
      method: "POST",
      headers: {
        Origin: from,
        "CF-Connecting-IP": ip,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it("registers, returns the current public user, logs out, and handles invalid credentials", async () => {
    const input = { email, password, name: "Test User" };
    const registered = await register(post("register", input));
    expect(registered.status).toBe(201);
    const user = { id: expect.any(String), email, name: input.name };
    expect(await registered.json()).toEqual(user);
    const setCookie = registered.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Max-Age=604800/i);
    const cookie = setCookie.split(";")[0];
    const current = await me(
      new Request(`${origin}/api/auth/me`, { headers: { Cookie: cookie } }),
    );
    expect(current.status).toBe(200);
    const body = await current.json();
    expect(Object.keys(body).sort()).toEqual(["email", "id", "name"]);
    expect(body).toEqual(user);
    const loggedOut = await logout(post("logout"));
    expect(loggedOut.status).toBe(204);
    expect(loggedOut.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    expect((await me(new Request(`${origin}/api/auth/me`))).status).toBe(401);
    expect((await register(post("register", input))).status).toBe(409);

    const invalid = await login(post("login", { email, password: "wrong" }));
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Invalid email or password" },
    });
    const authenticated = await login(post("login", { email, password }));
    expect(authenticated.status).toBe(200);
    expect(await authenticated.json()).toEqual(user);
  });

  it("rejects cross-origin requests, requires JSON bodies, and sends Retry-After", async () => {
    expect(
      (await logout(post("logout", undefined, "https://elsewhere.example")))
        .status,
    ).toBe(403);
    const nonJson = () => post("register", undefined, origin, "192.0.2.2");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await register(nonJson())).status).toBe(415);
    }
    const limited = await register(nonJson());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
