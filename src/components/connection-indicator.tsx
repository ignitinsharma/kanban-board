import type { ConnectionState } from "@/features/board/board-subscription";
import styles from "./connection-indicator.module.css";

const labels: Record<ConnectionState, string> = {
  connecting: "Connecting",
  open: "Live",
  reconnecting: "Reconnecting",
  unauthenticated: "Sign in required",
  removed: "Board unavailable",
  closed: "Disconnected",
};

export function ConnectionIndicator({ state }: { state: ConnectionState }) {
  return (
    <span
      className={styles.indicator}
      data-state={state}
      role="status"
      aria-live="polite"
    >
      <span className={styles.dot} aria-hidden="true" />
      {labels[state]}
    </span>
  );
}
