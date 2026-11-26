import { generateKeyBetween } from "fractional-indexing";
import { AppError } from "../http/errors";

type Ordered = { id: string; position: string };
type Neighbors = { previousId: string | null; nextId: string | null };
type Gap = { previous: Ordered | null; next: Ordered | null };

function stale(): never {
  throw new AppError(
    409,
    "STALE_ORDER",
    "Ordering changed. Reload and try again.",
  );
}

export function appendPosition(items: readonly Ordered[]) {
  return generateKeyBetween(items.at(-1)?.position ?? null, null);
}

export function captureGap(
  items: readonly Ordered[],
  { previousId, nextId }: Neighbors,
): Gap {
  const previousIndex =
    previousId === null
      ? -1
      : items.findIndex((item) => item.id === previousId);
  const nextIndex =
    nextId === null
      ? items.length
      : items.findIndex((item) => item.id === nextId);
  if (previousId !== null && previousIndex < 0) stale();
  if (nextIndex !== previousIndex + 1) stale();
  const previous = items[previousIndex] ?? null;
  const next = items[nextIndex] ?? null;
  if (previous && next && previous.position >= next.position) stale();
  return { previous, next };
}

export function positionInGap(
  items: readonly Ordered[],
  gap: Gap,
  currentPosition?: string,
) {
  const previousIndex = gap.previous
    ? items.findIndex(
        (item) =>
          item.id === gap.previous?.id &&
          item.position === gap.previous.position,
      )
    : -1;
  const nextIndex = gap.next
    ? items.findIndex(
        (item) =>
          item.id === gap.next?.id && item.position === gap.next.position,
      )
    : items.length;
  if ((gap.previous && previousIndex < 0) || nextIndex <= previousIndex)
    stale();

  // Existing anchors are fixed. If another in-flight move filled the gap,
  // append behind it, immediately before the original right anchor.
  const previous = items[nextIndex - 1]?.position ?? null;
  const next = items[nextIndex]?.position ?? null;
  if (previous !== null && next !== null && previous >= next) stale();
  if (
    currentPosition !== undefined &&
    (previous === null || currentPosition > previous) &&
    (next === null || currentPosition < next)
  )
    return currentPosition;
  return generateKeyBetween(previous, next);
}
