import { randomUUID } from "node:crypto";

const input = process.argv[2] ?? process.env.BASE_URL;
let base;
try {
  base = new URL(input);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password
  )
    throw new Error();
} catch {
  console.error("FAIL setup: Supply an HTTP(S) URL as argument 1 or BASE_URL.");
  process.exit(1);
}

console.log(
  "One registration per run. Limit: five per hour per IP. Board cleanup leaves the throwaway account.",
);
const https = base.protocol === "https:";
let cookie;
let board;
let card;
let target;
let caseId;
const email = `smoke+${Date.now()}-${randomUUID()}@example.invalid`;

class CheckFailure extends Error {}

function check(condition, reason) {
  if (!condition) throw new CheckFailure(reason);
}

async function step(label, run) {
  try {
    const detail = await run();
    console.log(`PASS ${label}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    console.error(
      `FAIL ${label}: ${error instanceof CheckFailure ? error.message : "Request or response processing failed."}`,
    );
    throw error;
  }
}

function request(
  path,
  {
    method = "GET",
    body,
    authenticated = true,
    origin = base.origin,
    signal = AbortSignal.timeout(15_000),
  } = {},
) {
  return fetch(new URL(path, base), {
    method,
    redirect: "error",
    signal,
    headers: {
      ...(authenticated && cookie ? { Cookie: cookie } : {}),
      ...(method !== "GET" ? { Origin: origin } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(path, status, options) {
  const response = await request(path, options);
  check(
    response.status === status,
    `Expected HTTP ${status}, received ${response.status}.`,
  );
  return response.json();
}

const ms = (start) => `${Math.round(performance.now() - start)} ms`;

try {
  await step("1 health", async () => {
    const start = performance.now();
    const result = await json("/api/health", 200);
    check(
      result?.status === "ok" && Object.keys(result).length === 1,
      "Unexpected health payload.",
    );
    return ms(start);
  });

  await step("2 login headers", async () => {
    const response = await request("/login");
    check(
      response.status === 200,
      `Expected HTTP 200, received ${response.status}.`,
    );
    for (const name of [
      "content-security-policy",
      "x-content-type-options",
      "x-frame-options",
      "referrer-policy",
      ...(https ? ["strict-transport-security"] : []),
    ])
      check(response.headers.has(name), `Missing ${name}.`);
    await response.body?.cancel();
  });

  await step("3 register and session cookie", async () => {
    const response = await request("/api/auth/register", {
      method: "POST",
      body: { email, name: "Smoke Test", password: randomUUID() },
    });
    check(
      response.status === 201,
      `Expected HTTP 201, received ${response.status}.`,
    );
    const [session, ...attributes] = (response.headers.getSetCookie()[0] ?? "")
      .split(";")
      .map((part) => part.trim());
    const flags = attributes.map((value) => value.toLowerCase());
    check(
      session.includes("=") &&
        flags.includes("httponly") &&
        flags.includes("samesite=lax"),
      "Missing session cookie or required attributes.",
    );
    if (https)
      check(
        session.startsWith("__Host-") &&
          flags.includes("secure") &&
          flags.includes("path=/") &&
          !flags.some((value) => value.startsWith("domain=")),
        "Missing Secure or valid __Host- attributes.",
      );
    cookie = session;
    await response.body?.cancel();
  });

  await step("4 current user", async () => {
    const user = await json("/api/auth/me", 200);
    check(
      Object.keys(user).sort().join(",") === "email,id,name" &&
        user.email === email,
      "Unexpected public user.",
    );
  });

  await step("5 board, cards and move order", async () => {
    board = await json("/api/boards", 201, {
      method: "POST",
      body: { name: "Smoke Test" },
    });
    check(
      board.columns.map(({ name }) => name).join("|") ===
        "Backlog|In Progress|In Review|Done",
      "Unexpected default columns.",
    );
    target = board.columns[1];
    const create = (columnId, title) =>
      json("/api/cards", 201, { method: "POST", body: { columnId, title } });
    card = await create(board.columns[0].id, "Smoke card");
    const anchor = await create(target.id, "Anchor");
    await json(`/api/cards/${card.id}/move`, 200, {
      method: "PATCH",
      body: { columnId: target.id, previousId: null, nextId: anchor.id },
    });
    const snapshot = await json(`/api/boards/${board.id}`, 200);
    check(
      snapshot.cards
        .filter(({ columnId }) => columnId === target.id)
        .map(({ id }) => id)
        .join(",") === `${card.id},${anchor.id}`,
      "Unexpected card order after move.",
    );
  });

  await step("6 SSE streaming", async () => {
    const abort = new AbortController();
    const deadline = setTimeout(() => abort.abort(), 5_000);
    let reader;
    let remaining = "";
    const decoder = new TextDecoder();
    async function waitForFrame(predicate, budget, description) {
      const timer = setTimeout(() => abort.abort(), budget);
      try {
        for (;;) {
          const boundary = remaining.indexOf("\n\n");
          if (boundary >= 0) {
            const frame = remaining.slice(0, boundary);
            remaining = remaining.slice(boundary + 2);
            if (predicate(frame)) return;
            continue;
          }
          const chunk = await reader.read();
          check(!chunk.done, `SSE closed before ${description}.`);
          remaining += decoder.decode(chunk.value, { stream: true });
        }
      } catch (error) {
        if (abort.signal.aborted)
          throw new CheckFailure(
            `SSE ${description} timed out. The stream may be delayed or buffered.`,
          );
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    try {
      const start = performance.now();
      const response = await request(`/api/boards/${board.id}/events`, {
        signal: abort.signal,
      });
      check(
        response.status === 200 &&
          response.headers.get("content-type")?.startsWith("text/event-stream"),
        `Expected HTTP 200 text/event-stream, received HTTP ${response.status}.`,
      );
      reader = response.body.getReader();
      await waitForFrame(
        (frame) => frame.startsWith(": connected"),
        5_000,
        "first frame",
      );
      const connected = ms(start);
      clearTimeout(deadline);

      const sent = performance.now();
      caseId = `Smoke update ${randomUUID()}`;
      const update = json(`/api/cards/${card.id}`, 200, {
        method: "PATCH",
        body: { title: caseId },
      });
      await Promise.all([
        update,
        waitForFrame(
          (frame) => {
            if (!frame.startsWith("event: card.updated\n")) return false;
            const event = JSON.parse(
              frame
                .split("\n")
                .find((line) => line.startsWith("data: "))
                ?.slice(6) ?? "null",
            );
            return (
              event?.entity?.id === card.id && event.entity.title === caseId
            );
          },
          5_000,
          "card.updated event",
        ),
      ]);
      const event = ms(sent);
      await waitForFrame(
        (frame) => frame.startsWith(": heartbeat"),
        20_000,
        "heartbeat",
      );
      return `connected ${connected}, card.updated ${event}, heartbeat ${ms(start)} from open`;
    } catch (error) {
      if (!reader && abort.signal.aborted)
        throw new CheckFailure(
          "SSE response headers timed out after 5 seconds. The stream may be delayed or buffered.",
        );
      throw error;
    } finally {
      clearTimeout(deadline);
      abort.abort();
      await reader?.cancel().catch(() => {});
    }
  });

  await step("7 activity", async () => {
    const page = await json(`/api/boards/${board.id}/activity`, 200);
    const actions = new Set(
      page.items
        .filter(({ cardId }) => cardId === card.id)
        .map(({ action }) => action),
    );
    for (const action of ["CARD_CREATED", "CARD_MOVED", "CARD_UPDATED"])
      check(actions.has(action), `Missing ${action}.`);
  });

  await step("8 cross-origin POST", async () => {
    await json("/api/boards", 403, {
      method: "POST",
      origin: "https://evil.example",
      body: { name: "Blocked" },
    });
  });

  await step("9 unauthenticated boards", async () => {
    await json("/api/boards", 401, { authenticated: false });
  });
} catch {
  process.exitCode = 1;
} finally {
  try {
    await step("10 cleanup", async () => {
      if (!board?.id) return "No board was created.";
      const response = await request(`/api/boards/${board.id}`, {
        method: "DELETE",
      });
      check(
        response.status === 204,
        `Expected HTTP 204, received ${response.status}.`,
      );
      return "Board deleted.";
    });
  } catch {
    process.exitCode = 1;
  }
}
