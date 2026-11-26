import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/security/auth";
import { sessionCookieName } from "@/server/security/session-cookie";

export default async function Home() {
  const user = await getSessionUser(
    (await cookies()).get(sessionCookieName)?.value,
  );
  redirect(user ? "/boards" : "/login");
}
