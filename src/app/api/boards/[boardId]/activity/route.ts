import { resourceId } from "@/server/http/board-request";
import { withErrorHandling } from "@/server/http/handler";
import { requireUser } from "@/server/security/auth";
import { listActivity } from "@/server/services/activity.service";
import { activityQuerySchema } from "@/shared/activity";

type Context = { params: Promise<{ boardId: string }> };

export const GET = withErrorHandling(
  async (request: Request, context: Context) => {
    const user = await requireUser(request);
    const boardId = await resourceId(context, "boardId");
    const params = new URL(request.url).searchParams;
    const query = activityQuerySchema.parse(Object.fromEntries(params));
    return Response.json(await listActivity(boardId, user.id, query), {
      headers: { "Cache-Control": "no-store" },
    });
  },
);
