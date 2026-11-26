import { withErrorHandling } from "@/server/http/handler";
import { requireUser } from "@/server/security/auth";

export const GET = withErrorHandling(async (request: Request) =>
  Response.json(await requireUser(request), {
    headers: { "Cache-Control": "no-store" },
  }),
);
