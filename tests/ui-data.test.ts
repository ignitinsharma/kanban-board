import { afterEach, expect, it, vi } from "vitest";
import { apiClient, ApiError, getClientId } from "../src/lib/api-client";
import { groupCardsByColumn } from "../src/features/board/group-cards";
import type { Card } from "../src/shared/board";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("sends credentials and a stable tab ID only on mutations", async () => {
  const fetch = vi.fn().mockImplementation(async () => Response.json([]));
  vi.stubGlobal("fetch", fetch);
  await apiClient("/api/boards");
  const signal = new AbortController().signal;
  await apiClient("/api/boards", {
    method: "POST",
    body: { name: "Board" },
    signal,
  });
  await apiClient("/api/boards/id", { method: "DELETE" });
  const [read, create, remove] = fetch.mock.calls.map(([, options]) => options);
  expect(read.credentials).toBe("same-origin");
  expect(read.headers.get("x-client-id")).toBeNull();
  expect(create.headers.get("x-client-id")).toBe(getClientId());
  expect(remove.headers.get("x-client-id")).toBe(getClientId());
  expect(create.headers.get("content-type")).toBe("application/json");
  expect(create.body).toBe(JSON.stringify({ name: "Board" }));
  expect(create.signal).toBe(signal);
});

it("maps API errors and reads numeric, date, and absent retry delays", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const fetch = vi
    .fn()
    .mockImplementation(async () =>
      Response.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429, headers: { "Retry-After": "15" } },
      ),
    )
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(
      new Response(null, {
        status: 429,
        headers: { "Retry-After": "Thu, 01 Jan 2026 00:00:20 GMT" },
      }),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(apiClient("/api/boards")).rejects.toMatchObject({
    status: 503,
    code: "REQUEST_FAILED",
    retryAfter: null,
  });
  await expect(apiClient("/api/boards")).rejects.toMatchObject({
    retryAfter: 20,
  });
  await expect(apiClient("/api/boards")).rejects.toEqual(
    new ApiError(429, "RATE_LIMITED", "Too many requests", 15),
  );
  await expect(apiClient("/api/boards")).rejects.toMatchObject({
    status: 429,
    code: "RATE_LIMITED",
    retryAfter: 15,
  });
});

it("returns undefined on 204 without requiring a JSON body", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  );
  await expect(
    apiClient<void>("/api/boards/id", { method: "DELETE" }),
  ).resolves.toBeUndefined();
});

it("groups cards by column in their existing order and keeps their references", () => {
  const card: Card = {
    id: "a",
    columnId: "one",
    boardId: "board",
    assigneeId: null,
    description: null,
    position: "a0",
    title: "First",
    priority: "LOW",
    createdAt: "",
    updatedAt: "",
  };
  const other = { ...card, id: "b", columnId: "two" };
  const last = { ...card, id: "c", position: "a1" };
  const grouped = groupCardsByColumn([card, other, last]);
  expect(grouped.get("one")).toEqual([card, last]);
  expect(grouped.get("one")?.[1]).toBe(last);
  expect(grouped.get("two")).toEqual([other]);
  expect(groupCardsByColumn([]).size).toBe(0);
});
