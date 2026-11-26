"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/skeleton";
import { ApiError, getClientId } from "@/lib/api-client";
import type { BoardDetail, Card } from "@/shared/board";
import { useBoard } from "./board-hooks";
import { groupCardsByColumn } from "./group-cards";
import { useBoardEvents } from "./use-board-events";
import styles from "./board-view.module.css";

const emptyCards: readonly Card[] = [];

const CardTile = memo(function CardTile({
  title,
  priority,
  assignee,
}: {
  title: string;
  priority: Card["priority"];
  assignee?: string;
}) {
  return (
    <li className={styles.card}>
      <p className={styles.cardTitle}>{title}</p>
      <div className={styles.cardMeta}>
        <Badge priority={priority} />
        {assignee && <Avatar name={assignee} />}
      </div>
    </li>
  );
});

function BoardColumns({ detail }: { detail: BoardDetail }) {
  const grouped = useMemo(
    () => groupCardsByColumn(detail.cards),
    [detail.cards],
  );
  const members = useMemo(
    () => new Map(detail.members.map(({ id, name }) => [id, name])),
    [detail.members],
  );
  if (!detail.columns.length)
    return (
      <div className={styles.feedback}>
        <EmptyState title="No columns yet" />
      </div>
    );

  return (
    <div
      className={styles.columns}
      tabIndex={0}
      role="region"
      aria-label="Board columns"
    >
      {detail.columns.map((column) => {
        const cards = grouped.get(column.id) ?? emptyCards;
        return (
          <section
            className={styles.column}
            key={column.id}
            aria-labelledby={`column-${column.id}`}
          >
            <header className={styles.columnHeading}>
              <h2 id={`column-${column.id}`}>{column.name}</h2>
              <span
                className={styles.count}
                aria-label={`${cards.length} cards`}
              >
                {cards.length}
              </span>
            </header>
            <ul
              className={styles.cards}
              tabIndex={0}
              aria-label={`Cards in ${column.name}`}
            >
              {cards.length ? (
                cards.map((card) => (
                  <CardTile
                    key={card.id}
                    title={card.title}
                    priority={card.priority}
                    assignee={
                      card.assigneeId ? members.get(card.assigneeId) : undefined
                    }
                  />
                ))
              ) : (
                <li className={styles.emptyColumn}>No cards</li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function BoardView({ boardId }: { boardId: string }) {
  const router = useRouter();
  const board = useBoard(boardId);
  const [clientId] = useState(() =>
    typeof window === "undefined" ? "" : getClientId(),
  );
  const [retry, setRetry] = useState(0);
  const state = useBoardEvents(boardId, clientId, {
    onUnauthorized: () => router.replace("/login"),
    retry,
  });
  const status = board.error instanceof ApiError ? board.error.status : null;
  const removed = state === "removed" || status === 404;

  useEffect(() => {
    if (removed) router.replace("/boards?notice=removed");
    else if (status === 401) router.replace("/login");
  }, [removed, status, router]);

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <Link className={styles.back} href="/boards">
            <span aria-hidden="true">‹</span> Boards
          </Link>
          <h1>{board.data?.name ?? "Board"}</h1>
        </div>
        <ConnectionIndicator state={state} />
      </header>
      {removed ? (
        <div className={styles.feedback}>
          <EmptyState title="This board is no longer available" />
        </div>
      ) : board.isPending ? (
        <div
          className={styles.columns}
          role="status"
          aria-label="Loading board"
        >
          {[0, 1, 2, 3].map((id) => (
            <div className={styles.column} key={id}>
              <Skeleton />
              <Skeleton />
            </div>
          ))}
        </div>
      ) : board.isError && !board.data ? (
        <div className={styles.feedback}>
          <EmptyState
            title="Could not load board"
            action={
              <Button
                onClick={() => {
                  void board.refetch();
                  setRetry((value) => value + 1);
                }}
              >
                Retry
              </Button>
            }
          />
        </div>
      ) : (
        board.data && <BoardColumns detail={board.data} />
      )}
    </main>
  );
}
