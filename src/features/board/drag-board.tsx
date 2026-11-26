"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InlineError } from "@/components/inline-error";
import { ApiError } from "@/lib/api-client";
import type { BoardDetail, Card, Column } from "@/shared/board";
import { boardDetailQuery } from "./board-query";
import { useMoveCard } from "./board-mutations";
import { AddCard, AddColumn, ColumnHeader } from "./column-management";
import {
  buildItems,
  cardSlot,
  computeDrop,
  isNoop,
  moveInPreview,
  rebuildPreview,
  type Drop,
  type PreviewItems,
} from "./drag-logic";
import {
  MousePointerSensor,
  cardCollisions,
  columnTarget,
} from "./drag-sensors";
import { CardVisual, SortableCard } from "./sortable-card";
import styles from "./board-view.module.css";

const previewStrategy = () => null;
const measuring = { droppable: { strategy: MeasuringStrategy.Always } };
const pointerOptions = { activationConstraint: { distance: 6 } };
const touchOptions = { activationConstraint: { delay: 200, tolerance: 6 } };
const keyboardOptions = { coordinateGetter: sortableKeyboardCoordinates };
const instructions = {
  draggable:
    "Press Space to pick up a card, use the arrow keys to move it, then press Space to drop. Press Escape to cancel.",
};

type Drag = {
  id: string;
  base: BoardDetail;
  items: PreviewItems;
  original: Drop;
  touch: { index: number; height: number } | null;
};

const SortableColumn = memo(function SortableColumn({
  boardId,
  actorId,
  column,
  ids,
  touchDrag,
  cards,
  names,
  pending,
  onOpen,
}: {
  boardId: string;
  actorId: string;
  column: Column;
  ids: readonly string[];
  touchDrag?: Drag;
  cards: Map<string, Card>;
  names: Map<string, string>;
  pending: ReadonlySet<string>;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnTarget(column.id) });
  // TouchSensor follows the original DOM target, even when its preview slot moves.
  const renderIds = useMemo(() => {
    if (!touchDrag?.touch) return ids;
    const next = ids.map((id) =>
      id === touchDrag.id ? `placeholder:${id}` : id,
    );
    if (column.id === touchDrag.original.columnId)
      next.splice(touchDrag.touch.index, 0, touchDrag.id);
    return next;
  }, [column.id, ids, touchDrag]);
  const sortableIds = useMemo(() => [...ids], [ids]);
  return (
    <section className={styles.column} aria-labelledby={`column-${column.id}`}>
      <ColumnHeader
        boardId={boardId}
        actorId={actorId}
        column={column}
        count={ids.length}
      />
      <SortableContext
        id={column.id}
        items={sortableIds}
        strategy={previewStrategy}
      >
        <ul
          ref={setNodeRef}
          className={styles.cards}
          tabIndex={0}
          data-drop-over={isOver || undefined}
          aria-label={`Cards in ${column.name}`}
        >
          {renderIds.map((id) => {
            if (id.startsWith("placeholder:"))
              return (
                <TouchPlaceholder
                  key={id}
                  id={id}
                  height={touchDrag?.touch?.height ?? 60}
                />
              );
            const card = cards.get(id);
            return (
              card && (
                <SortableCard
                  key={id}
                  id={id}
                  title={card.title}
                  priority={card.priority}
                  assignee={
                    card.assigneeId ? names.get(card.assigneeId) : undefined
                  }
                  pending={pending.has(id)}
                  anchor={touchDrag?.id === id}
                  onOpen={onOpen}
                />
              )
            );
          })}
          {!ids.length && <li className={styles.emptyColumn}>No cards</li>}
        </ul>
      </SortableContext>
      <AddCard boardId={boardId} actorId={actorId} columnId={column.id} />
    </section>
  );
});

function TouchPlaceholder({ id, height }: { id: string; height: number }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <li
      ref={setNodeRef}
      aria-hidden="true"
      className={styles.touchPlaceholder}
      style={{ height }}
    />
  );
}

function currentPreview(drag: Drag, detail: BoardDetail, items: PreviewItems) {
  return drag.base === detail
    ? drag.items
    : rebuildPreview(drag.items, items, drag.id);
}

function moveNotice(error: unknown) {
  if (!(error instanceof ApiError))
    return "Could not move the card. Check your connection and try again.";
  if (error.status === 409)
    return "The board changed. Your move was not applied.";
  if (error.status === 404)
    return "This card or its destination is no longer available.";
  if (error.status === 403)
    return "You no longer have permission to move this card.";
  return error.message;
}

export const DragBoard = memo(function DragBoard({
  detail,
  actorId,
  onOpen,
}: {
  detail: BoardDetail;
  actorId: string;
  onOpen: (id: string) => void;
}) {
  const query = useQueryClient();
  const boardId = detail.id;
  const queryKey = useMemo(() => boardDetailQuery(boardId).queryKey, [boardId]);
  const { mutateAsync } = useMoveCard({ boardId, actorId });
  const [drag, setDrag] = useState<Drag>();
  const current = useRef<Drag | undefined>(undefined);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const pendingIds = useRef(new Set<string>());
  const [notice, setNotice] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const sensors = useSensors(
    useSensor(MousePointerSensor, pointerOptions),
    useSensor(TouchSensor, touchOptions),
    useSensor(KeyboardSensor, keyboardOptions),
  );
  const originalItems = useMemo(() => buildItems(detail), [detail]);
  const preview = useMemo(
    () => drag && currentPreview(drag, detail, originalItems),
    [drag, detail, originalItems],
  );
  const items = preview || originalItems;
  const cards = useMemo(
    () => new Map(detail.cards.map((card) => [card.id, card])),
    [detail.cards],
  );
  const names = useMemo(
    () => new Map(detail.members.map(({ id, name }) => [id, name])),
    [detail.members],
  );
  const active = preview && drag ? cards.get(drag.id) : undefined;
  const touchDrag = preview && drag?.touch ? drag : undefined;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const clear = useCallback(() => {
    current.current = undefined;
    setDrag(undefined);
  }, []);

  useEffect(() => {
    if (drag && preview === null) {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
        }),
      );
    }
  }, [drag, preview]);

  const start = useCallback(
    ({ active, activatorEvent }: DragStartEvent) => {
      const id = String(active.id);
      const base = query.getQueryData<BoardDetail>(queryKey);
      if (!base || pendingIds.current.has(id)) return;
      const items = buildItems(base);
      const original = computeDrop(items, id);
      if (!original) return;
      const touch =
        activatorEvent.type === "touchstart"
          ? {
              index: cardSlot(items, id)!.index,
              height: active.rect.current.initial?.height ?? 60,
            }
          : null;
      const next = { id, items, base, original, touch };
      current.current = next;
      setNotice("");
      setDrag(next);
    },
    [query, queryKey],
  );

  const over = useCallback(
    ({ active, over, collisions }: DragOverEvent) => {
      const drag = current.current;
      const base = query.getQueryData<BoardDetail>(queryKey);
      if (!drag || !base || !over || active.id === over.id) return;
      const items = currentPreview(
        drag,
        base,
        drag.base === base ? drag.items : buildItems(base),
      );
      if (!items) return;
      const target = String(over.id);
      const source = cardSlot(items, drag.id);
      const slot = target.startsWith("column:")
        ? null
        : cardSlot(items, target);
      const columnId = slot?.columnId ?? target.slice("column:".length);
      if (!items[columnId]) return;
      const hit = collisions?.[0]?.data;
      let index =
        slot?.index ?? (hit?.edge === "start" ? 0 : items[columnId].length);
      if (slot && typeof hit?.after === "boolean") {
        if (source && source.columnId === columnId && source.index < slot.index)
          index -= 1;
        if (hit.after) index += 1;
      }
      const next = moveInPreview(items, drag.id, columnId, index);
      if (next === items) return;
      const updated = { ...drag, base, items: next };
      current.current = updated;
      setDrag(updated);
    },
    [query, queryKey],
  );

  const end = useCallback(
    ({ over }: DragEndEvent) => {
      const drag = current.current;
      const base = query.getQueryData<BoardDetail>(queryKey);
      if (!drag || !base || !over) return clear();
      const latest = currentPreview(
        drag,
        base,
        drag.base === base ? drag.items : buildItems(base),
      );
      const drop = latest && computeDrop(latest, drag.id);
      if (
        !drop ||
        isNoop(drag.original, drop) ||
        pendingIds.current.has(drag.id)
      )
        return clear();

      const id = drag.id;
      pendingIds.current.add(id);
      setPending(new Set(pendingIds.current));
      void mutateAsync({
        id,
        drop,
        onPrepared: () => {
          if (current.current?.id === id) clear();
        },
      })
        .catch((error: unknown) => {
          if (current.current?.id === id) clear();
          setNotice(moveNotice(error));
        })
        .finally(() => {
          pendingIds.current.delete(id);
          setPending(new Set(pendingIds.current));
        });
    },
    [clear, mutateAsync, query, queryKey],
  );

  const announcements = useMemo<Announcements>(() => {
    const describe = (id: string, verb: string) => {
      const drag = current.current;
      const base = query.getQueryData<BoardDetail>(queryKey);
      if (!base) return;
      const arrangement =
        drag?.id === id
          ? currentPreview(
              drag,
              base,
              drag.base === base ? drag.items : buildItems(base),
            )
          : buildItems(base);
      const slot = arrangement && cardSlot(arrangement, id);
      const name = base.columns.find(({ id }) => id === slot?.columnId)?.name;
      const title = base.cards.find((card) => card.id === id)?.title;
      return slot && arrangement && title
        ? `${verb} card ${title} ${verb === "Picked up" ? "from" : "in"} ${name}, position ${slot.index + 1} of ${arrangement[slot.columnId].length}.`
        : undefined;
    };
    return {
      onDragStart: ({ active }) => describe(String(active.id), "Picked up"),
      onDragOver: ({ active, over }) =>
        over ? describe(String(active.id), "Moved") : undefined,
      onDragEnd: ({ active, over }) =>
        over ? describe(String(active.id), "Dropped") : "Drag cancelled.",
      onDragCancel: () => "Drag cancelled.",
    };
  }, [query, queryKey]);
  const accessibility = useMemo(
    () => ({ announcements, screenReaderInstructions: instructions }),
    [announcements],
  );

  return (
    <>
      {notice && (
        <div className={styles.moveNotice}>
          <InlineError>{notice}</InlineError>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={cardCollisions}
        measuring={measuring}
        onDragStart={start}
        onDragOver={over}
        onDragEnd={end}
        onDragCancel={clear}
        accessibility={accessibility}
      >
        <div
          className={styles.columns}
          tabIndex={0}
          role="region"
          aria-label="Board columns"
        >
          {detail.columns.map((column) => (
            <SortableColumn
              key={column.id}
              boardId={boardId}
              actorId={actorId}
              column={column}
              ids={items[column.id]}
              touchDrag={
                touchDrag &&
                (items[column.id].includes(touchDrag.id) ||
                  column.id === touchDrag.original.columnId)
                  ? touchDrag
                  : undefined
              }
              cards={cards}
              names={names}
              pending={pending}
              onOpen={onOpen}
            />
          ))}
          <AddColumn
            boardId={boardId}
            actorId={actorId}
            atLimit={detail.columns.length >= 12}
          />
        </div>
        <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
          {active && (
            <div className={`${styles.card} ${styles.overlay}`}>
              <CardVisual
                title={active.title}
                priority={active.priority}
                assignee={
                  active.assigneeId ? names.get(active.assigneeId) : undefined
                }
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </>
  );
});
