import type { NextResponse } from "next/server";
import { sessionMaxAge } from "./session";

const secure = process.env.NODE_ENV === "production";
export const sessionCookieName = secure
  ? "__Host-kanban-session"
  : "kanban-session";

export function readSessionCookie(request: Request) {
  const prefix = `${sessionCookieName}=`;
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length);
}

function writeSessionCookie(
  response: NextResponse,
  value: string,
  maxAge: number,
) {
  response.cookies.set(sessionCookieName, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge,
  });
}

export function setSessionCookie(response: NextResponse, token: string) {
  writeSessionCookie(response, token, sessionMaxAge);
}

export function clearSessionCookie(response: NextResponse) {
  writeSessionCookie(response, "", 0);
}
