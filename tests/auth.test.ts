import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loginSchema, registerSchema } from "../src/shared/auth";
import { DuplicateEmailError } from "../src/server/repositories/user.repository";
import { hashPassword, verifyPassword } from "../src/server/security/password";
import { MemoryRateLimiter } from "../src/server/security/rate-limit";
import {
  sessionMaxAge,
  signSession,
  verifySession,
} from "../src/server/security/session";
import { createAuthService } from "../src/server/services/auth.service";

const id = "21ad2cee-6d42-44b0-bb5c-53579caf66f3";
const secret = "test-only-secret-0123456789-0123456789";
const input = {
  email: " PERSON@example.com ",
  name: "Person",
  password: "password",
};
const publicUser = { id, name: input.name, email: "person@example.com" };

afterEach(() => vi.unstubAllEnvs());

it("enforces bcrypt password byte boundaries and strict objects", () => {
  for (const [password, valid] of [
    ["é".repeat(3), false],
    ["é".repeat(4), true],
    ["é".repeat(36), true],
    ["é".repeat(37), false],
  ] as const) {
    expect(registerSchema.safeParse({ ...input, password }).success).toBe(
      valid,
    );
  }
  expect(
    loginSchema.safeParse({ email: input.email, password: "" }).success,
  ).toBe(false);
  expect(
    loginSchema.safeParse({ email: input.email, password: "é".repeat(37) })
      .success,
  ).toBe(false);
  expect(registerSchema.safeParse({ ...input, unexpected: true }).success).toBe(
    false,
  );
});

it("hashes at cost 12 and verifies only the correct password", async () => {
  const hash = await hashPassword(input.password);
  expect(hash).toMatch(/^\$2b\$12\$/);
  expect(await verifyPassword(input.password, hash)).toBe(true);
  expect(await verifyPassword("wrong", hash)).toBe(false);
});

it("verifies a seven-day JWT and rejects expiry, tampering, wrong algorithms and missing claims", async () => {
  vi.stubEnv("JWT_SECRET", secret);
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  const key = new TextEncoder().encode(secret);
  const now = Math.floor(Date.now() / 1000);
  const token = await signSession(id);
  expect(await verifySession(token)).toBe(id);
  const [header, claims, signature] = token.split(".");
  const payload = JSON.parse(Buffer.from(claims, "base64url").toString());
  expect(payload).toEqual({
    sub: id,
    iat: expect.any(Number),
    exp: payload.iat + sessionMaxAge,
  });
  const initial = signature[0] === "A" ? "B" : "A";
  expect(
    await verifySession(`${header}.${claims}.${initial}${signature.slice(1)}`),
  ).toBeNull();
  for (const [alg, fields] of [
    ["HS256", { sub: id, iat: now - 100, exp: now - 1 }],
    ["HS384", { sub: id, iat: now, exp: now + 60 }],
    ["HS256", { iat: now, exp: now + 60 }],
    ["HS256", { sub: id, exp: now + 60 }],
    ["HS256", { sub: id, iat: now }],
  ] as const) {
    expect(
      await verifySession(
        await new SignJWT(fields).setProtectedHeader({ alg }).sign(key),
      ),
    ).toBeNull();
  }
});

it("enforces fixed windows, resets expired limits and cleans up expired keys", () => {
  let now = 0;
  const limiter = new MemoryRateLimiter(() => now);
  expect(limiter.consume("ip", 2, 1000)).toBe(0);
  expect(limiter.consume("ip", 2, 1000)).toBe(0);
  expect(limiter.consume("ip", 2, 1000)).toBe(1);
  expect(limiter.consume("expired", 1, 1000)).toBe(0);
  now = 1000;
  expect(limiter.consume("ip", 2, 1000)).toBe(0);
  expect(limiter.cleanup()).toBe(1);
  limiter.consume("later", 1, 1000);
  now = 60_000;
  limiter.consume("new", 1, 1000);
  expect(limiter.cleanup()).toBe(0);
});

describe("auth service", () => {
  function fixture() {
    const users = {
      create: vi
        .fn()
        .mockResolvedValue({ ...publicUser, passwordHash: "stored" }),
      findByEmail: vi
        .fn()
        .mockResolvedValue({ ...publicUser, passwordHash: "stored" }),
      findById: vi.fn(),
    };
    const passwords = {
      hash: vi.fn().mockResolvedValue("stored"),
      verify: vi.fn().mockResolvedValue(true),
    };
    return { users, passwords, service: createAuthService(users, passwords) };
  }

  it("registers with a normalized email and maps duplicate email to conflict", async () => {
    const { users, passwords, service } = fixture();
    expect(await service.register(input)).toEqual(publicUser);
    expect(passwords.hash).toHaveBeenCalledWith(input.password);
    expect(users.create).toHaveBeenCalledWith({
      email: publicUser.email,
      name: publicUser.name,
      passwordHash: "stored",
    });
    users.create.mockRejectedValueOnce(new DuplicateEmailError());
    await expect(service.register(input)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("logs in and compares a dummy hash for unknown email with the same error as a wrong password", async () => {
    const { users, passwords, service } = fixture();
    expect(await service.login(input)).toEqual(publicUser);
    expect(passwords.verify).toHaveBeenLastCalledWith(input.password, "stored");
    passwords.verify.mockResolvedValueOnce(false);
    const error = { status: 401, message: "Invalid email or password" };
    await expect(service.login(input)).rejects.toMatchObject(error);
    users.findByEmail.mockResolvedValueOnce(null);
    await expect(service.login(input)).rejects.toMatchObject(error);
    expect(passwords.verify).toHaveBeenLastCalledWith(
      input.password,
      expect.stringMatching(/^\$2b\$12\$/),
    );
  });
});
