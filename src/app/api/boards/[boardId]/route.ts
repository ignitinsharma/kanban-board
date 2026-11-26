import { withErrorHandling } from "@/server/http/handler";
import { requireUser } from "@/server/security/auth";
import { boardActor, resourceId } from "@/server/http/board-request";
import { readJsonBody } from "@/server/http/json-body";
import { boardUpdateSchema } from "@/shared/kanban";
import { boardService } from "@/server/services/board.service";

type Context = { params: Promise<{ boardId: string }> };

export const GET = withErrorHandling(
  async (request: Request, context: Context) => {
    const user = await requireUser(request);
    const id = await resourceId(context, "boardId");
    return Response.json(await boardService.get(id, user.id));
  },
);

export const PATCH = withErrorHandling(
  async (request: Request, context: Context) => {
    const user = await requireUser(request);
    const id = await resourceId(context, "boardId");
    const input = boardUpdateSchema.parse(await readJsonBody(request));
    const actor = boardActor(request, user);
    return Response.json(await boardService.rename(id, input.name, actor));
  },
);

export const DELETE = withErrorHandling(
  async (request: Request, context: Context) => {
    const user = await requireUser(request);
    const id = await resourceId(context, "boardId");
    const actor = boardActor(request, user);
    await boardService.remove(id, actor);
    return new Response(null, { status: 204 });
  },
);
