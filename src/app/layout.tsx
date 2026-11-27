import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/styles/tokens.css";
import { QueryProvider } from "@/lib/query-client";

export const metadata: Metadata = { title: "Kanban" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
