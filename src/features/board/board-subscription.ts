import type { QueryClient } from "@tanstack/react-query";
import { applyBoardEvent } from "@/shared/apply-board-event";
import type { BoardDetail } from "@/shared/board";
import { boardEventTypes, parseBoardEvent } from "@/shared/board-event-schema";
import type { BoardEvent } from "@/shared/events";
import {
  boardDetailQuery,
  boardListKey,
  BoardRequestError,
} from "./board-query";

export type ConnectionState = "connecting" | "open" | "closed";

export function subscribeToBoard(
  query: QueryClient,
  boardId: string,
  onState: (state: ConnectionState) => void,
  openSource = (url: string) => new EventSource(url),
) {
  const options = boardDetailQuery(boardId);
  const filters = { queryKey: options.queryKey, exact: true };
  const url = `/api/boards/${encodeURIComponent(boardId)}/events`;
  const deleted = new Set<string>();
  const patches: BoardEvent[] = [];
  let source: EventSource;
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
    if (busy) void query.cancelQueries(filters, { revert: false });
  }

  function closeSource() {
    generation += 1;
    source.onopen = source.onerror = null;
    for (const type of boardEventTypes)
      source.removeEventListener(type, receive);
    source.close();
  }

  function removeBoard() {
    stop();
    query.removeQueries(filters);
    void query.invalidateQueries({ queryKey: boardListKey, exact: true });
    onState("closed");
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
            if (
              error instanceof BoardRequestError &&
              [401, 404].includes(error.status)
            )
              removeBoard();
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
      removeBoard();
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

  function connect() {
    onState("connecting");
    const current = openSource(url);
    source = current;
    for (const type of boardEventTypes) current.addEventListener(type, receive);
    current.onopen = () => {
      if (stopped || source !== current) return;
      onState("open");
      reconcile();
    };
    current.onerror = () => {
      if (stopped || source !== current) return;
      if (current.readyState === 2) {
        onState("closed");
        reconcile();
      } else onState("connecting");
    };
  }

  connect();
  return stop;
}
