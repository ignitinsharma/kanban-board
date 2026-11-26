import { withErrorHandling } from "@/server/http/handler";
import { requireUser } from "@/server/security/auth";
import { boardActor } from "@/server/http/board-request";
import { readJsonBody } from "@/server/http/json-body";
import { cardCreateSchema } from "@/shared/kanban";
import { cardService } from "@/server/services/card.service";

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser(request);
  const input = cardCreateSchema.parse(await readJsonBody(request));
  const actor = boardActor(request, user);
  return Response.json(await cardService.create(input, actor), { status: 201 });
});
