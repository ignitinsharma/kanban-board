import type { QueryClient } from "@tanstack/react-query";
import { applyBoardEvent } from "@/shared/apply-board-event";
import type { Board, BoardDetail } from "@/shared/board";
import { boardEventTypes, parseBoardEvent } from "@/shared/board-event-schema";
import type { BoardEvent } from "@/shared/events";
import {
  boardDetailQuery,
  boardListKey,
  BoardRequestError,
} from "./board-query";

export type ConnectionState =
  | "connecting"
  | "open"
  | "reconnecting"
  | "unauthenticated"
  | "removed"
  | "closed";

export function subscribeToBoard(
  query: QueryClient,
  boardId: string,
  onState: (state: ConnectionState) => void,
  openSource = (url: string) => new EventSource(url),
  onUnauthorized?: () => void,
) {
  const options = boardDetailQuery(boardId);
  const filters = { queryKey: options.queryKey, exact: true };
  const url = `/api/boards/${encodeURIComponent(boardId)}/events`;
  const deleted = new Set<string>();
  const patches: BoardEvent[] = [];
  let source: EventSource | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let probing = false;
  let backoffStep = 0;
  let reopened = false;
  let stopped = false;
  let busy = false;
  let refresh = false;
  let generation = 0;
  let pumping = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    closeSource();
    patches.length = 0;
    clearTimeout(retryTimer);
    if (busy || probing) void query.cancelQueries(filters, { revert: false });
  }

  function closeSource() {
    generation += 1;
    const current = source;
    source = undefined;
    if (!current) return;
    current.onopen = current.onerror = null;
    for (const type of boardEventTypes)
      current.removeEventListener(type, receive);
    current.close();
  }

  function terminate(state: "removed" | "unauthenticated" | "closed") {
    stop();
    if (state !== "closed") query.removeQueries(filters);
    if (state === "removed") {
      query.setQueryData<Board[]>(boardListKey, (boards) =>
        boards?.filter(({ id }) => id !== boardId),
      );
      void query.invalidateQueries({ queryKey: boardListKey, exact: true });
    }
    onState(state);
    if (state === "unauthenticated") onUnauthorized?.();
  }

  function handleAccessError(error: unknown) {
    if (!(error instanceof BoardRequestError)) return false;
    if (error.status === 401) terminate("unauthenticated");
    else if (error.status === 404) terminate("removed");
    else return false;
    return true;
  }

  function scheduleProbe() {
    const base = Math.min(30_000, 1000 * 2 ** backoffStep);
    backoffStep = Math.min(backoffStep + 1, 5);
    const delay = Math.round(base * (0.8 + Math.random() * 0.2));
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void probe();
    }, delay);
  }

  async function probe() {
    if (stopped) return;
    const epoch = generation;
    probing = true;
    try {
      await query.cancelQueries(filters, { revert: false });
      if (stopped || epoch !== generation) return;
      await query.fetchQuery({ ...options, staleTime: 0, retry: false });
      if (stopped || epoch !== generation) return;
      reopened = true;
      connect(true);
    } catch (error) {
      if (stopped || epoch !== generation || handleAccessError(error)) return;
      if (
        !(error instanceof BoardRequestError) ||
        error.status === 429 ||
        error.status >= 500
      )
        scheduleProbe();
      else terminate("closed");
    } finally {
      probing = false;
    }
  }

  function reconcile() {
    refresh = true;
    patches.length = 0;
    void pump();
  }

  async function pump() {
    if (pumping || stopped) return;
    pumping = true;
    try {
      while (!stopped && (refresh || patches.length)) {
        const epoch = generation;
        const snapshot = refresh;
        refresh = false;
        busy = snapshot;
        await query.cancelQueries(filters, { revert: false });
        if (stopped || epoch !== generation) continue;
        if (snapshot) {
          try {
            await query.fetchQuery({ ...options, staleTime: 0, retry: false });
          } catch (error) {
            if (stopped || epoch !== generation) continue;
            handleAccessError(error);
          } finally {
            busy = false;
          }
          continue;
        }
        for (const event of patches.splice(0)) {
          const current = query.getQueryData<BoardDetail>(options.queryKey);
          if (!current) {
            refresh = true;
            break;
          }
          const result = applyBoardEvent(current, event);
          if (result.boardDetail && result.boardDetail !== current)
            query.setQueryData(options.queryKey, result.boardDetail);
          refresh ||= result.needsRefetch;
        }
      }
    } finally {
      busy = false;
      pumping = false;
    }
  }

  function receive(message: Event) {
    if (stopped || (message.currentTarget && message.currentTarget !== source))
      return;
    let event: BoardEvent | null;
    try {
      event = parseBoardEvent(
        JSON.parse((message as MessageEvent).data),
        message.type,
      );
    } catch {
      event = null;
    }
    if (!event || event.boardId !== boardId) {
      reconcile();
      return;
    }
    if (event.type === "board.deleted" && event.entity.id === boardId) {
      terminate("removed");
      return;
    }
    const key = `${event.type.split(".")[0]}:${event.entity.id}`;
    if (deleted.has(key)) return;
    if (event.type === "card.deleted" || event.type === "column.deleted") {
      deleted.add(key);
      if (deleted.size >= 1024) {
        closeSource();
        if (busy) void query.cancelQueries(filters, { revert: false });
        patches.length = 0;
        refresh = false;
        deleted.clear();
        connect();
        return;
      }
    }
    if (busy || refresh || patches.length >= 64) {
      reconcile();
      return;
    }
    patches.push(event);
    void pump();
  }

  function connect(reconnecting = false) {
    onState(reconnecting ? "reconnecting" : "connecting");
    const current = openSource(url);
    source = current;
    for (const type of boardEventTypes) current.addEventListener(type, receive);
    current.onopen = () => {
      if (stopped || source !== current) return;
      backoffStep = 0;
      reopened = false;
      onState("open");
      reconcile();
    };
    current.onerror = () => {
      if (stopped || source !== current) return;
      if (current.readyState === 2) {
        closeSource();
        if (busy) void query.cancelQueries(filters, { revert: false });
        refresh = false;
        patches.length = 0;
        onState("reconnecting");
        if (reopened) scheduleProbe();
        else void probe();
      } else onState("reconnecting");
    };
  }

  connect();
  return stop;
}
