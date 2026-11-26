import { UnauthorizedError } from "../http/errors";
import { userRepository } from "../repositories/user.repository";
import { verifySession, verifySessionClaims } from "./session";
import { readSessionCookie } from "./session-cookie";

export async function getSessionUser(token: string | undefined) {
  if (!token) return null;
  const id = await verifySession(token);
  return id ? userRepository.findById(id) : null;
}

export async function requireUser(request: Request) {
  const user = await getSessionUser(readSessionCookie(request));
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireSession(request: Request) {
  const token = readSessionCookie(request);
  const session = token ? await verifySessionClaims(token) : null;
  if (!session || !(await userRepository.findById(session.userId)))
    throw new UnauthorizedError();
  return session;
}
