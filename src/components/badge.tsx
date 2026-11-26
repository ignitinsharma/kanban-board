import type { CardPriority } from "@/shared/kanban";
import styles from "./badge.module.css";

const labels: Record<CardPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export function Badge({ priority }: { priority: CardPriority }) {
  return (
    <span className={styles.badge} data-priority={priority}>
      {labels[priority]}
    </span>
  );
}
