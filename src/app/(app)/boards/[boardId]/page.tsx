import { notFound } from "next/navigation";
import { BoardView } from "@/features/board/board-view";
import { idSchema } from "@/shared/kanban";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const id = idSchema.safeParse((await params).boardId);
  if (!id.success) notFound();
  return <BoardView key={id.data} boardId={id.data} />;
}
