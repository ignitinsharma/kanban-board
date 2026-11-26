import { expect, it, vi } from "vitest";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants";
import configure from "../next.config";
import { readJsonBody } from "@/server/http/json-body";
import { withErrorHandling } from "@/server/http/handler";
import { limitUserRequest } from "@/server/security/auth";

const url = "http://localhost/api/test";
const headers = { "Content-Type": "application/json" };

it("accepts exactly 64 KiB and rejects oversized streamed UTF-8 without trusting Content-Length", async () => {
  const request = (body: string) =>
    new Request(url, {
      method: "POST",
      headers: { ...headers, "Content-Length": "1" },
      body,
    });
  const value = "é".repeat(32_767);
  await expect(readJsonBody(request(JSON.stringify(value)))).resolves.toBe(
    value,
  );
  await expect(
    readJsonBody(request(JSON.stringify(value + "é"))),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    readJsonBody(request(JSON.stringify(Array(40_000).fill(0)))),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    readJsonBody(
      new Request(url, {
        method: "POST",
        headers: { ...headers, "Content-Length": "65537" },
      }),
    ),
  ).rejects.toMatchObject({ status: 413 });
});

it("rejects unsupported types, malformed JSON and excessive nesting", async () => {
  await expect(
    readJsonBody(new Request(url, { method: "POST", body: "{}" })),
  ).rejects.toMatchObject({ status: 415 });
  for (const body of ["{", "[".repeat(40) + "0" + "]".repeat(40)]) {
    await expect(
      readJsonBody(new Request(url, { method: "POST", headers, body })),
    ).rejects.toMatchObject({ status: 400 });
  }
});

it("returns a generic uncached JSON 500 in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await withErrorHandling(() => {
      throw new Error("private internal detail");
    })(new Request(url));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  } finally {
    log.mockRestore();
    vi.unstubAllEnvs();
  }
});

it("assigns each authenticated user separate read and mutation quotas", async () => {
  const consume = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(3);
  await limitUserRequest(new Request(url), "one", { consume });
  await expect(
    limitUserRequest(new Request(url, { method: "PATCH" }), "two", { consume }),
  ).rejects.toMatchObject({ status: 429, retryAfter: 3 });
  expect(consume.mock.calls).toEqual([
    ["read:one", 600, 60_000],
    ["write:two", 120, 60_000],
  ]);
});

it("applies production security headers to HTML, JSON and streams through a single catch-all", async () => {
  const config = await configure(PHASE_PRODUCTION_BUILD);
  expect(config.poweredByHeader).toBe(false);
  expect(await config.headers?.()).toEqual([
    {
      source: "/:path*",
      headers: expect.arrayContaining([
        {
          key: "Content-Security-Policy",
          value: expect.stringContaining("frame-ancestors 'none'"),
        },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), payment=()",
        },
        { key: "Strict-Transport-Security", value: "max-age=15552000" },
      ]),
    },
  ]);
  expect(JSON.stringify(await config.headers?.())).not.toContain("unsafe-eval");
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  vi.stubEnv("JWT_SECRET", "fixture".repeat(8));
  try {
    const dev = await configure(PHASE_DEVELOPMENT_SERVER);
    const serialized = JSON.stringify(await dev.headers?.());
    expect(serialized).toContain("unsafe-eval");
    expect(serialized).not.toContain("Strict-Transport-Security");
  } finally {
    vi.unstubAllEnvs();
  }
});
