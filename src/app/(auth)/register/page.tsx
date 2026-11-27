import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthArt } from "@/features/auth/auth-art";
import { AuthForm } from "@/features/auth/auth-form";
import { getSessionUser } from "@/server/security/auth";
import { sessionCookieName } from "@/server/security/session-cookie";

export const metadata: Metadata = { title: "Create account | Kanban" };

export default async function Page() {
  const user = await getSessionUser(
    (await cookies()).get(sessionCookieName)?.value,
  );
  if (user) redirect("/");
  return <AuthForm mode="register" art={<AuthArt />} />;
}
