import { withErrorHandling } from "@/server/http/handler";
import { requireUser } from "@/server/security/auth";
import { boardActor, resourceId } from "@/server/http/board-request";
import { readJsonBody } from "@/server/http/json-body";
import { memberAddSchema } from "@/shared/kanban";
import { memberService } from "@/server/services/member.service";

type Context = { params: Promise<{ boardId: string }> };

export const POST = withErrorHandling(
  async (request: Request, context: Context) => {
    const user = await requireUser(request);
    const id = await resourceId(context, "boardId");
    const input = memberAddSchema.parse(await readJsonBody(request));
    const actor = boardActor(request, user);
    return Response.json(await memberService.add(id, input.email, actor), {
      status: 201,
    });
  },
);
