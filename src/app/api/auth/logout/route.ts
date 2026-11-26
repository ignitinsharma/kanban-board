import { NextResponse } from "next/server";
import { withErrorHandling } from "@/server/http/handler";
import { clearSessionCookie } from "@/server/security/session-cookie";

export const POST = withErrorHandling(() => {
  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response);
  return response;
});
