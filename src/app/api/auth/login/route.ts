import { NextResponse } from "next/server";
import { loginSchema } from "@/shared/auth";
import { RateLimitError } from "@/server/http/errors";
import { withErrorHandling } from "@/server/http/handler";
import { readJsonBody } from "@/server/http/json-body";
import { authRateLimiter, getClientIp } from "@/server/security/rate-limit";
import { signSession } from "@/server/security/session";
import { setSessionCookie } from "@/server/security/session-cookie";
import { authService } from "@/server/services/auth.service";

export const POST = withErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  const windowMs = 15 * 60_000;
  const ipRetry = await authRateLimiter.consume(`login:ip:${ip}`, 10, windowMs);
  if (ipRetry) throw new RateLimitError(ipRetry);

  const input = loginSchema.parse(await readJsonBody(request));
  const emailRetry = await authRateLimiter.consume(
    `login:email:${ip}:${input.email}`,
    10,
    windowMs,
  );
  if (emailRetry) throw new RateLimitError(emailRetry);

  const user = await authService.login(input);
  const response = NextResponse.json(user);
  setSessionCookie(response, await signSession(user.id));
  return response;
});
