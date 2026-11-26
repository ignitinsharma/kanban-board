import type { ReactNode } from "react";
import styles from "./inline-error.module.css";
export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p className={styles.error} role="alert">
      {children}
    </p>
  );
}
