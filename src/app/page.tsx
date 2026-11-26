import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/features/auth/logout-button";
import { getSessionUser } from "@/server/security/auth";
import { sessionCookieName } from "@/server/security/session-cookie";

export default async function Home() {
  const user = await getSessionUser(
    (await cookies()).get(sessionCookieName)?.value,
  );
  if (!user) redirect("/login");
  return (
    <main>
      <h1>Welcome, {user.name}</h1>
      <LogoutButton />
    </main>
  );
}
