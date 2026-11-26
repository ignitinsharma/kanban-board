import { withErrorHandling } from "@/server/http/handler";
import { requireUser } from "@/server/security/auth";
import { boardActor, resourceId } from "@/server/http/board-request";
import { readJsonBody } from "@/server/http/json-body";
import { cardUpdateSchema } from "@/shared/kanban";
import { cardService } from "@/server/services/card.service";

type Context = { params: Promise<{ cardId: string }> };

export const PATCH = withErrorHandling(
  async (request: Request, context: Context) => {
    const user = await requireUser(request);
    const id = await resourceId(context, "cardId");
    const input = cardUpdateSchema.parse(await readJsonBody(request));
    const actor = boardActor(request, user);
    return Response.json(await cardService.update(id, input, actor));
  },
);

export const DELETE = withErrorHandling(
  async (request: Request, context: Context) => {
    const user = await requireUser(request);
    const id = await resourceId(context, "cardId");
    const actor = boardActor(request, user);
    await cardService.remove(id, actor);
    return new Response(null, { status: 204 });
  },
);
