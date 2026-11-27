"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/button";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { EmptyState } from "@/components/empty-state";
import { Toast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import type { Card } from "@/shared/board";
import { ApiError, getClientId } from "@/lib/api-client";
import { ActivityPanel } from "./activity-panel";
import { useBoard } from "./board-hooks";
import { CardDetailDialog } from "./card-detail-dialog";
import { DragBoard } from "./drag-board";
import { FilterToolbar } from "./filter-toolbar";
import {
  filterBoard,
  hasActiveFilters,
  matchesCard,
  parseFilters,
  searchTerms,
} from "./filter-logic";
import { MembersDialog } from "./members-dialog";
import { useBoardEvents } from "./use-board-events";
import styles from "./board-view.module.css";

export function BoardView({
  boardId,
  actorId,
}: {
  boardId: string;
  actorId: string;
}) {
  const router = useRouter();
  const board = useBoard(boardId);
  const params = useSearchParams();
  const members = board.data?.members;
  const memberIds = useMemo(
    () => members && new Set(members.map(({ id }) => id)),
    [members],
  );
  const { assignee, priority, q } = parseFilters(params, memberIds);
  const filters = useMemo(
    () => ({ assignee, priority, q }),
    [assignee, priority, q],
  );
  const filtered = useMemo(
    () => board.data && filterBoard(board.data, filters),
    [board.data, filters],
  );
  const dragEnabled = !hasActiveFilters(filters);
  const currentFilters = useRef(filters);
  const [notice, setNotice] = useState<{ message: string }>();
  const announce = useCallback((message: string) => setNotice({ message }), []);

  useLayoutEffect(() => {
    currentFilters.current = filters;
  }, [filters]);

  const onCardCreated = useCallback(
    (card: Card) => {
      const current = currentFilters.current;
      announce(
        matchesCard(card, current, searchTerms(current.q))
          ? "Card created."
          : "Card created. It is hidden by the current filters.",
      );
    },
    [announce],
  );

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [clientId] = useState(() =>
    typeof window === "undefined" ? "" : getClientId(),
  );
  const [retry, setRetry] = useState(0);
  const [selected, openCard] = useState<string>();
  const [membersOpen, setMembersOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const activityButton = useRef<HTMLButtonElement>(null);
  const closeActivity = useCallback(() => {
    setActivityOpen(false);
    activityButton.current?.focus();
  }, []);
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
    <main
      className={styles.page}
      data-activity-open={activityOpen && !removed ? "" : undefined}
    >
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
            <>
              <Button onClick={() => setMembersOpen(true)}>Members</Button>
              <Button
                ref={activityButton}
                aria-expanded={activityOpen}
                onClick={() =>
                  activityOpen ? closeActivity() : setActivityOpen(true)
                }
              >
                Activity
              </Button>
            </>
          )}
        </div>
      </header>
      {board.data && filtered && !removed && (
        <FilterToolbar
          filters={filters}
          members={board.data.members}
          visible={filtered.counts.visible}
          total={filtered.counts.total}
        />
      )}
      {!removed && notice && <Toast>{notice.message}</Toast>}
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
        board.data &&
        filtered && (
          <DragBoard
            detail={board.data}
            actorId={actorId}
            onOpen={showCard}
            filtered={filtered}
            dragEnabled={dragEnabled}
            onCardCreated={onCardCreated}
          />
        )
      )}
      {activityOpen && !removed && (
        <ActivityPanel boardId={boardId} onClose={closeActivity} />
      )}
      {selected && (
        <CardDetailDialog
          key={selected}
          id={selected}
          boardId={boardId}
          actorId={actorId}
          onClose={closeCard}
          onDeleted={() => announce("Card deleted.")}
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
