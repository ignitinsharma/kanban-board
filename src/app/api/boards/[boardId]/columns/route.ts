import { withErrorHandling } from "@/server/http/handler";
import { requireUser } from "@/server/security/auth";
import { boardActor, resourceId } from "@/server/http/board-request";
import { readJsonBody } from "@/server/http/json-body";
import { columnInputSchema } from "@/shared/kanban";
import { columnService } from "@/server/services/column.service";

type Context = { params: Promise<{ boardId: string }> };

export const POST = withErrorHandling(
  async (request: Request, context: Context) => {
    const user = await requireUser(request);
    const id = await resourceId(context, "boardId");
    const input = columnInputSchema.parse(await readJsonBody(request));
    const actor = boardActor(request, user);
    return Response.json(await columnService.create(id, input.name, actor), {
      status: 201,
    });
  },
);
