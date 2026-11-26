import { withErrorHandling } from "@/server/http/handler";
import { requireUser } from "@/server/security/auth";
import { boardActor, resourceId } from "@/server/http/board-request";
import { readJsonBody } from "@/server/http/json-body";
import { cardMoveSchema } from "@/shared/kanban";
import { cardService } from "@/server/services/card.service";

type Context = { params: Promise<{ cardId: string }> };

export const PATCH = withErrorHandling(
  async (request: Request, context: Context) => {
    const user = await requireUser(request);
    const id = await resourceId(context, "cardId");
    const input = cardMoveSchema.parse(await readJsonBody(request));
    const actor = boardActor(request, user);
    return Response.json(await cardService.move(id, input, actor));
  },
);
