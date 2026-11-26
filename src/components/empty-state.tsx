import type { ReactNode } from "react";
import styles from "./empty-state.module.css";
export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <section className={styles.empty}>
      <h2>{title}</h2>
      {action}
    </section>
  );
}
