import { withErrorHandling } from "@/server/http/handler";
import { requireUser } from "@/server/security/auth";
import { boardActor } from "@/server/http/board-request";
import { readJsonBody } from "@/server/http/json-body";
import { boardInputSchema } from "@/shared/kanban";
import { boardService } from "@/server/services/board.service";

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser(request);
  return Response.json(await boardService.list(user.id));
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser(request);
  const input = boardInputSchema.parse(await readJsonBody(request));
  const actor = boardActor(request, user);
  return Response.json(await boardService.create(input.name, actor), {
    status: 201,
  });
});
