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
import type { ActivityPage } from "@/shared/activity";
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

export function ActivityPanel({
  boardId,
  onClose,
}: {
  boardId: string;
  onClose: () => void;
}) {
  const client = useQueryClient();
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
    const run = () => {
      controller?.abort();
      const signal = (controller = new AbortController()).signal;
      void fetchPage(boardId, null, signal)
        .then((page) => {
          if (signal.aborted) return;
          setRefreshError(false);
          client.setQueryData<InfiniteData<ActivityPage, string | null>>(
            ["activity", boardId],
            (existing) => {
              if (!existing?.pages.length)
                return { pages: [page], pageParams: [null] };
              const [first, ...older] = existing.pages;
              if (!first.items.length)
                return { ...existing, pages: [page, ...older] };
              const known = new Set(page.items.map(({ id }) => id));
              return {
                ...existing,
                pages: [
                  {
                    ...first,
                    items: [
                      ...page.items,
                      ...first.items.filter(({ id }) => !known.has(id)),
                    ].sort((a, b) =>
                      a.createdAt === b.createdAt
                        ? a.id < b.id
                          ? 1
                          : -1
                        : a.createdAt < b.createdAt
                          ? 1
                          : -1,
                    ),
                  },
                  ...older,
                ],
              };
            },
          );
        })
        .catch(() => {
          if (!signal.aborted) setRefreshError(true);
        });
    };
    refresh.current = run;
    if (client.getQueryData(["activity", boardId])) run();
    const unsubscribe = client.getQueryCache().subscribe((event) => {
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

  const items = activity.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <aside
      className={styles.panel}
      aria-labelledby="activity-heading"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className={styles.heading}>
        <h2 id="activity-heading">Activity</h2>
        <Button ref={close} onClick={onClose}>
          Close
        </Button>
      </header>
      <div className={styles.content}>
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
          <ol className={styles.entries} aria-label="Board activity">
            {items.map((entry) => (
              <li key={entry.id}>
                <Avatar name={entry.actor.name} />
                <div>
                  <p>{formatActivity(entry)}</p>
                  <time
                    dateTime={entry.createdAt}
                    title={new Date(entry.createdAt).toISOString()}
                  >
                    {now === undefined
                      ? ""
                      : relativeTime(entry.createdAt, now)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p>No activity yet</p>
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
            disabled={activity.isFetchingNextPage}
            onClick={() => void activity.fetchNextPage()}
          >
            {activity.isFetchNextPageError ? "Retry" : "Load more"}
          </Button>
        )}
      </div>
    </aside>
  );
}
