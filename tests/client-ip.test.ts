import { afterEach, expect, it, vi } from "vitest";
import { getClientIp } from "@/server/security/rate-limit";

afterEach(() => vi.unstubAllEnvs());

it.each([
  [
    "prefers the overwritten address",
    "203.0.113.10",
    "192.0.2.20",
    "203.0.113.10",
  ],
  ["uses a single appended address", undefined, "192.0.2.20", "192.0.2.20"],
  [
    "ignores spoofed leading entries",
    undefined,
    "198.51.100.30, 2001:db8::1",
    "2001:db8::1",
  ],
  [
    "falls back when the primary is invalid",
    "invalid",
    "198.51.100.30, 192.0.2.20",
    "192.0.2.20",
  ],
  [
    "ignores an invalid final address",
    undefined,
    "198.51.100.30, invalid",
    "unknown",
  ],
  [
    "uses a shared bucket without either header",
    undefined,
    undefined,
    "unknown",
  ],
])("%s", (_label, connecting, forwarded, expected) => {
  vi.stubEnv("RENDER", "true");
  const headers = new Headers();
  if (connecting) headers.set("CF-Connecting-IP", connecting);
  if (forwarded) headers.set("X-Forwarded-For", forwarded);
  expect(getClientIp(new Request("https://example.com", { headers }))).toBe(
    expected,
  );
});

it("ignores proxy headers outside Render", () => {
  vi.stubEnv("RENDER", undefined);
  const headers = {
    "CF-Connecting-IP": "203.0.113.10",
    "X-Forwarded-For": "192.0.2.20",
  };
  expect(getClientIp(new Request("https://example.com", { headers }))).toBe(
    "unknown",
  );
});
