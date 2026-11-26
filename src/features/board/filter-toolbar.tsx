"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Select } from "@/components/select";
import type { BoardMember } from "@/shared/board";
import { cardPrioritySchema } from "@/shared/kanban";
import {
  hasActiveFilters,
  serializeFilters,
  type Filters,
} from "./filter-logic";
import styles from "./filter-toolbar.module.css";

const emptyFilters: Filters = { assignee: null, priority: null, q: "" };

export function FilterToolbar({
  filters: { assignee, priority, q },
  members,
  visible,
  total,
}: {
  filters: Filters;
  members: BoardMember[];
  visible: number;
  total: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [draft, setDraft] = useState(q);
  const [seenQuery, setSeenQuery] = useState(q);
  const [submitted, setSubmitted] = useState<string>();
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );
  const active = hasActiveFilters({ assignee, priority, q });

  if (q !== seenQuery) {
    setSeenQuery(q);
    if (q !== submitted) setDraft(q);
    else setSubmitted(undefined);
  }

  const replace = useCallback(
    (filters: Filters) => {
      const search = serializeFilters(filters);
      if (
        search === serializeFilters({ assignee, priority, q }) &&
        window.location.search.slice(1) === search
      )
        return;
      setSubmitted(new URLSearchParams(search).get("q") ?? "");
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      });
    },
    [assignee, pathname, priority, q, router],
  );

  useEffect(() => {
    if (
      draft === q ||
      serializeFilters({ assignee, priority, q: draft }) ===
        serializeFilters({ assignee, priority, q })
    )
      return;
    const timer = window.setTimeout(
      () => replace({ assignee, priority, q: draft }),
      200,
    );
    return () => window.clearTimeout(timer);
  }, [assignee, draft, priority, q, replace]);

  return (
    <div className={styles.toolbar} role="search" aria-label="Filter cards">
      <div className={styles.controls}>
        <label className={styles.search}>
          <span>Search cards</span>
          <Input
            type="search"
            value={draft}
            placeholder="Search title or description"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              setDraft("");
              replace({ assignee, priority, q: "" });
            }}
          />
        </label>
        <label>
          <span>Assignee</span>
          <Select
            value={assignee ?? ""}
            onChange={(event) =>
              replace({
                assignee: event.target.value || null,
                priority,
                q: draft,
              })
            }
          >
            <option value="">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {sortedMembers.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span>Priority</span>
          <Select
            value={priority ?? ""}
            onChange={(event) =>
              replace({
                assignee,
                priority:
                  cardPrioritySchema.safeParse(event.target.value).data ?? null,
                q: draft,
              })
            }
          >
            <option value="">All priorities</option>
            {cardPrioritySchema.options.map((value) => (
              <option key={value} value={value}>
                {value[0]}
                {value.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </label>
        {active && (
          <Button
            variant="ghost"
            onClick={() => {
              setDraft("");
              replace(emptyFilters);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
      {active && (
        <div className={styles.notes}>
          <p aria-live="polite" role="status">
            {visible} of {total} cards
          </p>
          <p>Clear filters to reorder cards</p>
        </div>
      )}
    </div>
  );
}
