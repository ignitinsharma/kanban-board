import { NextResponse } from "next/server";
import { registerSchema } from "@/shared/auth";
import { RateLimitError } from "@/server/http/errors";
import { withErrorHandling } from "@/server/http/handler";
import { readJsonBody } from "@/server/http/json-body";
import { authRateLimiter, getClientIp } from "@/server/security/rate-limit";
import { signSession } from "@/server/security/session";
import { setSessionCookie } from "@/server/security/session-cookie";
import { authService } from "@/server/services/auth.service";

export const POST = withErrorHandling(async (request: Request) => {
  const retryAfter = await authRateLimiter.consume(
    `register:${getClientIp(request)}`,
    5,
    60 * 60_000,
  );
  if (retryAfter) throw new RateLimitError(retryAfter);

  const user = await authService.register(
    registerSchema.parse(await readJsonBody(request)),
  );
  const response = NextResponse.json(user, { status: 201 });
  setSessionCookie(response, await signSession(user.id));
  return response;
});
