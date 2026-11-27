import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getSessionUser } from "@/server/security/auth";
import { sessionCookieName } from "@/server/security/session-cookie";
import { notFound, redirect } from "next/navigation";
import { BoardView } from "@/features/board/board-view";
import { idSchema } from "@/shared/kanban";

export const metadata: Metadata = { title: "Board | Kanban" };

export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const id = idSchema.safeParse((await params).boardId);
  if (!id.success) notFound();
  const user = await getSessionUser(
    (await cookies()).get(sessionCookieName)?.value,
  );
  if (!user) redirect("/login");
  return <BoardView key={id.data} boardId={id.data} actorId={user.id} />;
}
