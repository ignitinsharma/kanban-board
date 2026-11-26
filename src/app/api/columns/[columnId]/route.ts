import { withErrorHandling } from "@/server/http/handler";
import { requireUser } from "@/server/security/auth";
import { boardActor, resourceId } from "@/server/http/board-request";
import { readJsonBody } from "@/server/http/json-body";
import { columnInputSchema } from "@/shared/kanban";
import { columnService } from "@/server/services/column.service";

type Context = { params: Promise<{ columnId: string }> };

export const PATCH = withErrorHandling(
  async (request: Request, context: Context) => {
    const user = await requireUser(request);
    const id = await resourceId(context, "columnId");
    const input = columnInputSchema.parse(await readJsonBody(request));
    const actor = boardActor(request, user);
    return Response.json(await columnService.rename(id, input.name, actor));
  },
);

export const DELETE = withErrorHandling(
  async (request: Request, context: Context) => {
    const user = await requireUser(request);
    const id = await resourceId(context, "columnId");
    const actor = boardActor(request, user);
    await columnService.remove(id, actor);
    return new Response(null, { status: 204 });
  },
);
