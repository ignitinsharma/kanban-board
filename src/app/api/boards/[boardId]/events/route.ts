import { resourceId } from "@/server/http/board-request";
import { RateLimitError } from "@/server/http/errors";
import { withErrorHandling } from "@/server/http/handler";
import { streamAdmission } from "@/server/realtime/admission";
import { boardEvents } from "@/server/realtime/event-bus";
import { shutdownSignal } from "@/server/realtime/shutdown";
import { boardEventStream } from "@/server/realtime/sse";
import { runInTransaction } from "@/server/repositories/transaction";
import { requireSession } from "@/server/security/auth";
import { requireMembership } from "@/server/services/board-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ boardId: string }> };

export const GET = withErrorHandling(
  async (request: Request, context: Context) => {
    const { userId, expiresAt } = await requireSession(request);
    const boardId = await resourceId(context, "boardId");
    const authorize = () =>
      runInTransaction((db) => requireMembership(db, boardId, userId));
    await authorize();
    const release = streamAdmission.acquire(userId);
    if (!release) throw new RateLimitError(10);

    return new Response(
      boardEventStream({
        boardId,
        expiresAt,
        signal: request.signal,
        shutdown: shutdownSignal(),
        events: boardEvents,
        authorize,
        release,
      }),
      {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform, private",
          "X-Accel-Buffering": "no",
        },
      },
    );
  },
);
