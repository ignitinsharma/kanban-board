import { expect, test } from "vitest";
import { GET } from "@/app/api/health/route";

test("health responds with an OK status", async () => {
  const response = await GET(new Request("http://localhost/api/health"));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: "ok" });
});
