"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/skeleton";
import { ApiError, getClientId } from "@/lib/api-client";
import type { BoardDetail, Card } from "@/shared/board";
import { useBoard } from "./board-hooks";
import { CardDetailDialog } from "./card-detail-dialog";
import { AddCard, AddColumn, ColumnHeader } from "./column-management";
import { MembersDialog } from "./members-dialog";
import { groupCardsByColumn } from "./group-cards";
import { useBoardEvents } from "./use-board-events";
import styles from "./board-view.module.css";

const emptyCards: readonly Card[] = [];

const CardTile = memo(function CardTile({
  id,
  title,
  priority,
  assignee,
  onOpen,
}: {
  id: string;
  title: string;
  priority: Card["priority"];
  assignee?: string;
  onOpen: (id: string) => void;
}) {
  return (
    <li>
      <button type="button" className={styles.card} onClick={() => onOpen(id)}>
        <span className={styles.cardTitle}>{title}</span>
        <span className={styles.cardMeta}>
          <Badge priority={priority} />
          {assignee && <Avatar name={assignee} />}
        </span>
      </button>
    </li>
  );
});

const BoardColumns = memo(function BoardColumns({
  detail,
  actorId,
  onOpen,
}: {
  detail: BoardDetail;
  actorId: string;
  onOpen: (id: string) => void;
}) {
  const grouped = useMemo(
    () => groupCardsByColumn(detail.cards),
    [detail.cards],
  );
  const members = useMemo(
    () => new Map(detail.members.map(({ id, name }) => [id, name])),
    [detail.members],
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
            <ColumnHeader
              boardId={detail.id}
              actorId={actorId}
              column={column}
              count={cards.length}
            />
            <ul
              className={styles.cards}
              tabIndex={0}
              aria-label={`Cards in ${column.name}`}
            >
              {cards.length ? (
                cards.map((card) => (
                  <CardTile
                    key={card.id}
                    id={card.id}
                    onOpen={onOpen}
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
            <AddCard
              boardId={detail.id}
              actorId={actorId}
              columnId={column.id}
            />
          </section>
        );
      })}
      <AddColumn
        boardId={detail.id}
        actorId={actorId}
        atLimit={detail.columns.length >= 12}
      />
    </div>
  );
});

export function BoardView({
  boardId,
  actorId,
}: {
  boardId: string;
  actorId: string;
}) {
  const router = useRouter();
  const board = useBoard(boardId);
  const [clientId] = useState(() =>
    typeof window === "undefined" ? "" : getClientId(),
  );
  const [retry, setRetry] = useState(0);
  const [selected, openCard] = useState<string>();
  const [membersOpen, setMembersOpen] = useState(false);
  const showCard = useCallback((id: string) => openCard(id), []);
  const closeCard = useCallback(() => openCard(undefined), []);
  const closeMembers = useCallback(() => setMembersOpen(false), []);
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
        <div className={styles.headerActions}>
          <ConnectionIndicator state={state} />
          {board.data && (
            <Button onClick={() => setMembersOpen(true)}>Members</Button>
          )}
        </div>
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
        board.data && (
          <BoardColumns
            detail={board.data}
            actorId={actorId}
            onOpen={showCard}
          />
        )
      )}
      {selected && (
        <CardDetailDialog
          key={selected}
          id={selected}
          boardId={boardId}
          actorId={actorId}
          onClose={closeCard}
        />
      )}
      {membersOpen && (
        <MembersDialog
          boardId={boardId}
          actorId={actorId}
          onClose={closeMembers}
        />
      )}
    </main>
  );
}
