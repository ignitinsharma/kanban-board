"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { Disclosure } from "@/components/disclosure";
import { Dialog } from "@/components/dialog";
import { InlineError } from "@/components/inline-error";
import type { Card, Column } from "@/shared/board";
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
  onCreated,
}: MutationScope & { columnId: string; onCreated: (card: Card) => void }) {
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
        add.mutate(
          { title, columnId },
          {
            onSuccess: (result) => {
              setOpen(false);
              if (result.type === "card.created") onCreated(result.entity);
            },
          },
        )
      }
    />
  ) : (
    <Button
      className={styles.addCard}
      variant="ghost"
      onClick={() => setOpen(true)}
    >
      <span aria-hidden="true">+</span> Add card
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
          <span aria-hidden="true">+</span> Add column
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
  total,
}: MutationScope & { column: Column; count: number; total?: number }) {
  const [mode, setMode] = useState<"rename" | "delete">();
  const rename = useRenameColumn({ boardId, actorId });
  const remove = useDeleteColumn({ boardId, actorId });
  return (
    <>
      <header className={styles.columnHeader}>
        <div className={styles.columnTitle}>
          <h2 id={`column-${column.id}`}>{column.name}</h2>
          <span
            className={styles.count}
            aria-label={
              total === undefined
                ? `${count} cards`
                : `${count} of ${total} cards`
            }
          >
            {total === undefined ? count : `${count} / ${total}`}
          </span>
        </div>
        <Disclosure
          label={`Actions for ${column.name}`}
          trigger={<span aria-hidden="true">•••</span>}
        >
          {(close) => (
            <>
              <Button
                variant="ghost"
                aria-label={`Rename ${column.name}`}
                onClick={() => {
                  close();
                  rename.reset();
                  setMode("rename");
                }}
              >
                Rename
              </Button>
              <Button
                variant="ghost"
                aria-label={`Delete ${column.name}`}
                onClick={() => {
                  close();
                  remove.reset();
                  setMode("delete");
                }}
              >
                Delete
              </Button>
            </>
          )}
        </Disclosure>
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
