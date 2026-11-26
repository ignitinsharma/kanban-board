import type { ReactNode } from "react";
import "@/styles/tokens.css";
import { QueryProvider } from "@/lib/query-client";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
