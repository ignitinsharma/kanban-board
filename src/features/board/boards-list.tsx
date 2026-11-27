"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/button";
import { Dialog } from "@/components/dialog";
import { Disclosure } from "@/components/disclosure";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import { InlineError } from "@/components/inline-error";
import { Input } from "@/components/input";
import { Skeleton } from "@/components/skeleton";
import type { Board } from "@/shared/board";
import { boardInputSchema } from "@/shared/kanban";
import {
  useBoards,
  useCreateBoard,
  useDeleteBoard,
  useRenameBoard,
} from "./board-hooks";
import styles from "./boards-list.module.css";

type Action = { type: "create" } | { type: "rename" | "delete"; board: Board };
const formatDate = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function BoardsList({
  userId,
  removed,
}: {
  userId: string;
  removed: boolean;
}) {
  const boards = useBoards();
  const [action, setAction] = useState<Action>();
  const [notice, setNotice] = useState(removed);
  useEffect(() => {
    if (removed) window.history.replaceState(null, "", "/boards");
  }, [removed]);

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <h1>Boards</h1>
        <Button variant="primary" onClick={() => setAction({ type: "create" })}>
          <span aria-hidden="true">+</span> New board
        </Button>
      </div>
      {notice && (
        <div className={styles.notice} role="status">
          This board is no longer available
          <Button variant="ghost" onClick={() => setNotice(false)}>
            Dismiss
          </Button>
        </div>
      )}
      {boards.isPending ? (
        <div
          className={styles.loading}
          role="status"
          aria-label="Loading boards"
        >
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : boards.isError ? (
        <EmptyState
          title="Could not load boards"
          action={<Button onClick={() => void boards.refetch()}>Retry</Button>}
        />
      ) : boards.data.length === 0 ? (
        <EmptyState
          title="No boards yet"
          action={
            <Button
              variant="primary"
              onClick={() => setAction({ type: "create" })}
            >
              Create a board
            </Button>
          }
        />
      ) : (
        <ul className={styles.list}>
          {boards.data.map((board) => (
            <li key={board.id} className={styles.row}>
              <Link
                className={styles.boardLink}
                href={`/boards/${board.id}`}
                aria-label={board.name}
              >
                <span className={styles.name}>{board.name}</span>
                <span className={styles.date}>
                  Updated{" "}
                  <time dateTime={board.updatedAt}>
                    {formatDate.format(new Date(board.updatedAt))}
                  </time>
                </span>
              </Link>
              <div className={styles.boardMenu}>
                <Disclosure
                  label={`Actions for ${board.name}`}
                  trigger={<span aria-hidden="true">•••</span>}
                >
                  {(close) => (
                    <>
                      <Button
                        variant="ghost"
                        aria-label={`Rename ${board.name}`}
                        onClick={(event) => {
                          close(event.currentTarget);
                          setAction({ type: "rename", board });
                        }}
                      >
                        Rename
                      </Button>
                      {board.ownerId === userId && (
                        <Button
                          variant="ghost"
                          aria-label={`Delete ${board.name}`}
                          onClick={(event) => {
                            close(event.currentTarget);
                            setAction({ type: "delete", board });
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </>
                  )}
                </Disclosure>
              </div>
            </li>
          ))}
        </ul>
      )}
      {action && (
        <BoardDialog action={action} onClose={() => setAction(undefined)} />
      )}
    </main>
  );
}

function BoardDialog({
  action,
  onClose,
}: {
  action: Action;
  onClose: () => void;
}) {
  const create = useCreateBoard();
  const rename = useRenameBoard();
  const remove = useDeleteBoard();
  const [fieldError, setFieldError] = useState<string>();
  const title =
    action.type === "create"
      ? "Create board"
      : action.type === "rename"
        ? "Rename board"
        : "Delete board";
  const mutation =
    action.type === "create"
      ? create
      : action.type === "rename"
        ? rename
        : remove;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action.type === "delete") {
      remove.mutate(action.board.id, { onSuccess: onClose });
      return;
    }
    const parsed = boardInputSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setFieldError("Enter a board name from 1 to 100 characters.");
      return;
    }
    setFieldError(undefined);
    if (action.type === "create")
      create.mutate(parsed.data.name, { onSuccess: onClose });
    else
      rename.mutate(
        { id: action.board.id, name: parsed.data.name },
        { onSuccess: onClose },
      );
  }

  return (
    <Dialog
      title={title}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <form className={styles.form} onSubmit={submit}>
        {action.type === "delete" ? (
          <p>
            Delete <strong>{action.board.name}</strong> and all its columns and
            cards?
          </p>
        ) : (
          <FormField id="board-name" label="Board name" error={fieldError}>
            {(props) => (
              <Input
                {...props}
                name="name"
                defaultValue={action.type === "rename" ? action.board.name : ""}
                required
                maxLength={100}
              />
            )}
          </FormField>
        )}
        {mutation.error && <InlineError>{mutation.error.message}</InlineError>}
        <div className={styles.actions}>
          <Button onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={mutation.isPending}
            variant={action.type === "delete" ? "danger" : "primary"}
          >
            {title}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
