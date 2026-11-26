import type { PublicUser } from "@/shared/auth";
import { withErrorHandling } from "@/server/http/handler";
import { requireUser } from "@/server/security/auth";

export const GET = withErrorHandling(async (request: Request) => {
  const { id, email, name } = await requireUser(request);
  const user: PublicUser = { id, email, name };
  return Response.json(user, { headers: { "Cache-Control": "no-store" } });
});
