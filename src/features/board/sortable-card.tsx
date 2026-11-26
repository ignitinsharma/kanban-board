"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo } from "react";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/badge";
import type { Card } from "@/shared/board";
import styles from "./board-view.module.css";

export const CardVisual = memo(function CardVisual({
  title,
  priority,
  assignee,
}: {
  title: string;
  priority: Card["priority"];
  assignee?: string;
}) {
  return (
    <>
      <span className={styles.cardTitle}>{title}</span>
      <span className={styles.cardMeta}>
        <Badge priority={priority} />
        {assignee && <Avatar name={assignee} />}
      </span>
    </>
  );
});

export const SortableCard = memo(function SortableCard({
  id,
  title,
  priority,
  assignee,
  pending,
  anchor,
  onOpen,
}: {
  id: string;
  title: string;
  priority: Card["priority"];
  assignee?: string;
  pending: boolean;
  anchor: boolean;
  onOpen: (id: string) => void;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    isDragging,
    transform,
  } = useSortable({
    id,
    disabled: { draggable: pending, droppable: false },
    transition: null,
  });
  return (
    <li
      ref={setNodeRef}
      className={styles.cardItem}
      data-card-id={id}
      data-drag-anchor={anchor || undefined}
      data-placeholder={isDragging || undefined}
      aria-busy={pending || undefined}
      style={
        transform ? { transform: CSS.Translate.toString(transform) } : undefined
      }
    >
      <button
        type="button"
        className={styles.card}
        onPointerDown={(event) => listeners?.onPointerDown?.(event)}
        onTouchStart={(event) => listeners?.onTouchStart?.(event)}
        onClick={() => {
          if (!isDragging) onOpen(id);
        }}
      >
        <CardVisual title={title} priority={priority} assignee={assignee} />
      </button>
      <button
        type="button"
        className={styles.grip}
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder card: ${title}`}
        disabled={pending}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="6" cy="4" r="1" />
          <circle cx="10" cy="4" r="1" />
          <circle cx="6" cy="8" r="1" />
          <circle cx="10" cy="8" r="1" />
          <circle cx="6" cy="12" r="1" />
          <circle cx="10" cy="12" r="1" />
        </svg>
      </button>
    </li>
  );
});
