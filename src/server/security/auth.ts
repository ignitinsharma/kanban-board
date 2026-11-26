import { MemoryRateLimiter, type RateLimiter } from "./rate-limit";
import { RateLimitError, UnauthorizedError } from "../http/errors";
import { userRepository } from "../repositories/user.repository";
import { verifySession, verifySessionClaims } from "./session";
import { readSessionCookie } from "./session-cookie";

export async function getSessionUser(token: string | undefined) {
  if (!token) return null;
  const id = await verifySession(token);
  return id ? userRepository.findById(id) : null;
}

const apiRateLimiter = new MemoryRateLimiter();

export async function limitUserRequest(
  request: Request,
  userId: string,
  limiter: RateLimiter = apiRateLimiter,
) {
  const read = request.method === "GET" || request.method === "HEAD";
  const retry = await limiter.consume(
    `${read ? "read" : "write"}:${userId}`,
    read ? 600 : 120,
    60_000,
  );
  if (retry) throw new RateLimitError(retry);
}

export async function requireUser(request: Request) {
  const user = await getSessionUser(readSessionCookie(request));
  if (!user) throw new UnauthorizedError();
  await limitUserRequest(request, user.id);
  return user;
}

export async function requireSession(request: Request) {
  const token = readSessionCookie(request);
  const session = token ? await verifySessionClaims(token) : null;
  if (!session || !(await userRepository.findById(session.userId)))
    throw new UnauthorizedError();
  return session;
}
