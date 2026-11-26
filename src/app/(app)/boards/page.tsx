import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BoardsList } from "@/features/board/boards-list";
import { getSessionUser } from "@/server/security/auth";
import { sessionCookieName } from "@/server/security/session-cookie";

export default async function BoardsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const user = await getSessionUser(
    (await cookies()).get(sessionCookieName)?.value,
  );
  if (!user) redirect("/login");
  return (
    <BoardsList
      userId={user.id}
      removed={(await searchParams).notice === "removed"}
    />
  );
}
