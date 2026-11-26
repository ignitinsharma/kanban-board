import { idSchema } from "@/shared/kanban";
import type { PublicUser } from "@/shared/auth";
import type { Actor } from "../services/board-context";

export function boardActor(request: Request, user: PublicUser): Actor {
  const client = idSchema.safeParse(request.headers.get("x-client-id"));
  return {
    actorId: user.id,
    originClientId: client.success ? client.data : null,
  };
}

export async function resourceId<Key extends string>(
  context: { params: Promise<Record<Key, string>> },
  key: Key,
) {
  return idSchema.parse((await context.params)[key]);
}
