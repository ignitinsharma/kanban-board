import { UnauthorizedError } from "../http/errors";
import { userRepository } from "../repositories/user.repository";
import { verifySession } from "./session";
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
