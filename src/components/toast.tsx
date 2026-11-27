import type { ReactNode } from "react";
import styles from "./toast.module.css";

export function Toast({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      className={styles.toast}
      data-error={error}
      role={error ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
