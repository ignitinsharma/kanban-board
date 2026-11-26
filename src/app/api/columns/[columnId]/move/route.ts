import { withErrorHandling } from "@/server/http/handler";
import { requireUser } from "@/server/security/auth";
import { boardActor, resourceId } from "@/server/http/board-request";
import { readJsonBody } from "@/server/http/json-body";
import { reorderSchema } from "@/shared/kanban";
import { columnService } from "@/server/services/column.service";

type Context = { params: Promise<{ columnId: string }> };

export const PATCH = withErrorHandling(
  async (request: Request, context: Context) => {
    const user = await requireUser(request);
    const id = await resourceId(context, "columnId");
    const input = reorderSchema.parse(await readJsonBody(request));
    const actor = boardActor(request, user);
    return Response.json(await columnService.move(id, input, actor));
  },
);
