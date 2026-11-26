import { jwtVerify, SignJWT } from "jose";
import { idSchema } from "@/shared/kanban";
import { getEnv } from "../config/env";

export const sessionMaxAge = 7 * 24 * 60 * 60;

function signingKey() {
  return new TextEncoder().encode(getEnv().JWT_SECRET);
}

export function signSession(userId: string) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(now + sessionMaxAge)
    .sign(signingKey());
}

export async function verifySession(token: string) {
  const key = signingKey();
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      requiredClaims: ["sub", "iat", "exp"],
      maxTokenAge: sessionMaxAge,
    });
    const subject = idSchema.safeParse(payload.sub);
    return subject.success ? subject.data : null;
  } catch {
    return null;
  }
}
