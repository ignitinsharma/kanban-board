"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { Dialog } from "@/components/dialog";
import { InlineError } from "@/components/inline-error";
import type { Column } from "@/shared/board";
import { InlineComposer } from "./inline-composer";
import {
  useCreateCard,
  useCreateColumn,
  useDeleteColumn,
  useRenameColumn,
  type MutationScope,
} from "./board-mutations";
import styles from "./board-management.module.css";

export function AddCard({
  boardId,
  actorId,
  columnId,
}: MutationScope & { columnId: string }) {
  const [open, setOpen] = useState(false);
  const add = useCreateCard({ boardId, actorId });
  return open ? (
    <InlineComposer
      kind="card"
      pending={add.isPending}
      error={add.error?.message}
      resetError={add.reset}
      onClose={() => {
        add.reset();
        setOpen(false);
      }}
      onSubmit={(title) =>
        add.mutate({ title, columnId }, { onSuccess: () => setOpen(false) })
      }
    />
  ) : (
    <Button
      className={styles.addCard}
      variant="ghost"
      onClick={() => setOpen(true)}
    >
      Add card
    </Button>
  );
}

export function AddColumn({
  boardId,
  actorId,
  atLimit,
}: MutationScope & { atLimit: boolean }) {
  const [open, setOpen] = useState(false);
  const add = useCreateColumn({ boardId, actorId });
  return (
    <div className={styles.addColumn}>
      {atLimit ? (
        <p className={styles.muted}>Column limit reached (12)</p>
      ) : open ? (
        <InlineComposer
          kind="column"
          pending={add.isPending}
          error={add.error?.message}
          resetError={add.reset}
          onClose={() => {
            add.reset();
            setOpen(false);
          }}
          onSubmit={(name) =>
            add.mutate(name, { onSuccess: () => setOpen(false) })
          }
        />
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Add column
        </Button>
      )}
    </div>
  );
}

export function ColumnHeader({
  boardId,
  actorId,
  column,
  count,
}: MutationScope & { column: Column; count: number }) {
  const [mode, setMode] = useState<"rename" | "delete">();
  const rename = useRenameColumn({ boardId, actorId });
  const remove = useDeleteColumn({ boardId, actorId });
  return (
    <>
      <header className={styles.columnHeader}>
        <div className={styles.columnTitle}>
          <h2 id={`column-${column.id}`}>{column.name}</h2>
          <span className={styles.count} aria-label={`${count} cards`}>
            {count}
          </span>
        </div>
        <div className={styles.tools}>
          <Button
            variant="ghost"
            className={styles.iconButton}
            title="Rename column"
            aria-label={`Rename ${column.name}`}
            onClick={() => {
              rename.reset();
              setMode("rename");
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m10.5 3 2.5 2.5M3 13l3.2-.7 7-7a.9.9 0 0 0 0-1.3l-1.2-1.2a.9.9 0 0 0-1.3 0l-7 7L3 13Z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
          </Button>
          <Button
            variant="ghost"
            className={styles.iconButton}
            title="Delete column"
            aria-label={`Delete ${column.name}`}
            onClick={() => {
              remove.reset();
              setMode("delete");
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.5 4.5h11m-7.5 0V2.8h4v1.7m2.4 0-.6 8.6H4.2l-.6-8.6m3 2v4.4m2.8-4.4v4.4"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Button>
        </div>
      </header>
      {mode === "rename" && (
        <InlineComposer
          kind="column"
          initial={column.name}
          pending={rename.isPending}
          error={rename.error?.message}
          resetError={rename.reset}
          onClose={() => setMode(undefined)}
          onSubmit={(name) =>
            rename.mutate(
              { id: column.id, name },
              { onSuccess: () => setMode(undefined) },
            )
          }
        />
      )}
      {mode === "delete" && (
        <Dialog
          title="Delete column?"
          onClose={() => {
            if (!remove.isPending) setMode(undefined);
          }}
        >
          <div className={styles.form}>
            <p>
              Delete <strong>{column.name}</strong>?
            </p>
            {remove.error && <InlineError>{remove.error.message}</InlineError>}
            <div className={styles.actions}>
              <Button
                disabled={remove.isPending}
                onClick={() => setMode(undefined)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(column.id, {
                    onSuccess: () => setMode(undefined),
                  })
                }
              >
                Delete column
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
