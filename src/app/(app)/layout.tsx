import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LogoutButton } from "@/features/auth/logout-button";
import { getSessionUser } from "@/server/security/auth";
import { sessionCookieName } from "@/server/security/session-cookie";
import styles from "./shell.module.css";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser(
    (await cookies()).get(sessionCookieName)?.value,
  );
  if (!user) redirect("/login");
  return (
    <>
      <header className={styles.bar}>
        <Link href="/boards" className={styles.brand}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="2.5"
              y="3"
              width="15"
              height="14"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path d="M7 6v8M13 6v8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Kanban
        </Link>
        <div className={styles.account}>
          <span className={styles.name}>{user.name}</span>
          <LogoutButton />
        </div>
      </header>
      {children}
    </>
  );
}
