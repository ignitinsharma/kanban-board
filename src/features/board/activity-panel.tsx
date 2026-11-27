"use client";

import { useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { InlineError } from "@/components/inline-error";
import { Skeleton } from "@/components/skeleton";
import { apiClient } from "@/lib/api-client";
import type { ActivityEntry, ActivityPage } from "@/shared/activity";
import { formatActivity } from "./activity-format";
import { boardDetailQuery } from "./board-query";
import styles from "./activity-panel.module.css";

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function relativeTime(date: string, now: number) {
  const seconds = (Date.parse(date) - now) / 1000;
  for (const [unit, size] of [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ] as const)
    if (Math.abs(seconds) >= size || unit === "second")
      return relative.format(Math.round(seconds / size), unit);
}

function fetchPage(
  boardId: string,
  cursor: string | null,
  signal: AbortSignal,
) {
  const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiClient<ActivityPage>(`/api/boards/${boardId}/activity${suffix}`, {
    signal,
  });
}

function newestFirst(a: ActivityEntry, b: ActivityEntry) {
  const left = a.createdAt + a.id;
  const right = b.createdAt + b.id;
  return left === right ? 0 : left > right ? -1 : 1;
}

export function ActivityPanel({
  boardId,
  cardId,
  onClose,
}: {
  boardId: string;
  cardId?: string;
  onClose?: () => void;
}) {
  const client = useQueryClient();
  const historyList = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState<number>();
  const [refreshError, setRefreshError] = useState(false);
  const refresh = useRef<() => void>(() => {});
  const activity = useInfiniteQuery({
    queryKey: ["activity", boardId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => fetchPage(boardId, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    close.current?.focus();
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    const frame = window.requestAnimationFrame(() => setNow(Date.now()));
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    const key = boardDetailQuery(boardId).queryKey;
    let previous = client.getQueryData(key);
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    let pending: ActivityPage | undefined;
    const activityKey = ["activity", boardId];
    const merge = () => {
      if (
        !pending ||
        client.getQueryState(activityKey)?.fetchStatus === "fetching"
      )
        return;
      const page = pending;
      pending = undefined;
      client.setQueryData<InfiniteData<ActivityPage, string | null>>(
        activityKey,
        (existing) => {
          if (!existing?.pages.length)
            return { pages: [page], pageParams: [null] };
          const [first, ...older] = existing.pages;
          if (!first.items.length)
            return { ...existing, pages: [page, ...older] };
          const known = new Set(
            existing.pages.flatMap(({ items }) => items.map(({ id }) => id)),
          );
          const additions = page.items.filter(({ id }) => !known.has(id));
          if (!additions.length) return existing;
          return {
            ...existing,
            pages: [
              { ...first, items: [...additions, ...first.items] },
              ...older,
            ],
          };
        },
      );
    };
    const run = () => {
      controller?.abort();
      const signal = (controller = new AbortController()).signal;
      void fetchPage(boardId, null, signal)
        .then((page) => {
          if (signal.aborted) return;
          setRefreshError(false);
          pending = page;
          merge();
        })
        .catch(() => {
          if (!signal.aborted) setRefreshError(true);
        });
    };
    refresh.current = run;
    if (client.getQueryData(["activity", boardId])) run();
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.query.queryKey[0] === "activity" &&
        event.query.queryKey[1] === boardId
      ) {
        merge();
        return;
      }
      if (
        event.type !== "updated" ||
        event.query.queryKey.length !== key.length ||
        !key.every((part, i) => event.query.queryKey[i] === part)
      )
        return;
      const current = event.query.state.data;
      if (!current || current === previous) return;
      previous = current;
      clearTimeout(timer);
      timer = setTimeout(run, 500);
    });
    return () => {
      clearTimeout(timer);
      controller?.abort();
      unsubscribe();
    };
  }, [boardId, client]);

  const items =
    activity.data?.pages
      .flatMap((page) => page.items)
      .filter((entry) => !cardId || entry.cardId === cardId)
      .sort(newestFirst) ?? [];

  const history = (
    <div
      ref={historyList}
      tabIndex={cardId ? -1 : undefined}
      className={cardId ? undefined : styles.content}
    >
      {activity.isPending ? (
        <div role="status" aria-label="Loading activity">
          <Skeleton />
          <Skeleton />
        </div>
      ) : activity.isError && !activity.data ? (
        <>
          <InlineError>Could not load activity.</InlineError>
          <Button onClick={() => void activity.refetch()}>Retry</Button>
        </>
      ) : items.length ? (
        <ol
          className={styles.entries}
          aria-label={cardId ? "Card activity" : "Board activity"}
        >
          {items.map((entry) => (
            <li key={entry.id}>
              <Avatar name={entry.actor.name} />
              <div>
                <p>{formatActivity(entry)}</p>
                <time
                  dateTime={entry.createdAt}
                  title={new Date(entry.createdAt).toISOString()}
                >
                  {now === undefined ? "" : relativeTime(entry.createdAt, now)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p>
          {cardId && activity.hasNextPage
            ? "No card activity in these entries"
            : "No activity yet"}
        </p>
      )}
      {refreshError && (
        <>
          <InlineError>Could not refresh activity.</InlineError>
          <Button onClick={() => refresh.current()}>Retry refresh</Button>
        </>
      )}
      {activity.isFetchNextPageError && (
        <InlineError>Could not load more activity.</InlineError>
      )}
      {activity.hasNextPage && (
        <Button
          aria-disabled={activity.isFetchingNextPage}
          onClick={(event) => {
            if (activity.isFetchingNextPage) return;
            const button = event.currentTarget;
            void activity.fetchNextPage().then((result) => {
              if (
                !result.hasNextPage &&
                (document.activeElement === button ||
                  document.activeElement === document.body)
              ) {
                (close.current ?? historyList.current)?.focus();
              }
            });
          }}
        >
          {activity.isFetchNextPageError ? "Retry" : "Load more"}
        </Button>
      )}
    </div>
  );

  return cardId ? (
    history
  ) : (
    <aside
      className={styles.panel}
      aria-labelledby="activity-heading"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose?.();
        }
      }}
    >
      <header className={styles.heading}>
        <h2 id="activity-heading">Activity</h2>
        <Button ref={close} onClick={onClose}>
          Close
        </Button>
      </header>
      {history}
    </aside>
  );
}
