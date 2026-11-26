import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "@/features/auth/auth-form";
import { getSessionUser } from "@/server/security/auth";
import { sessionCookieName } from "@/server/security/session-cookie";

export default async function Page() {
  const user = await getSessionUser(
    (await cookies()).get(sessionCookieName)?.value,
  );
  if (user) redirect("/");
  return <AuthForm mode="login" />;
}
