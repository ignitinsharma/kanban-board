# How does moving a card flow through this codebase? {#move-card-flow}

A drop updates the screen first, then commits to PostgreSQL in one board-locked transaction, and only then fans the change out over SSE. The browser never sends a final position: the server re-derives it from the neighbours you dropped between.

- The browser applies an optimistic move before the request leaves.[](source:move)
- The route handler authenticates, rate-limits and validates the drop, then calls `cardService.move`.[](source:route)
- `mutate` locks the board, writes the card and its activity row in one transaction, and publishes only after commit.[](source:bus)
- Every open board receives `card.moved` over SSE and re-applies it to the TanStack Query cache.[](source:sse)

@answer scope="Move one card on a shared board · Next.js App Router · PostgreSQL"
@meta locale=en style=product
@source route title="Move route handler" path=src/app/api/cards/[cardId]/move/route.ts lines=10:18
@source move title="Client optimistic move" path=src/features/board/move-card.ts lines=15:66
@source service title="Card service move" path=src/server/services/card.service.ts lines=160:208
@source bus title="After-commit publish" path=src/server/services/board-context.ts lines=60:81
@source sse title="SSE stream" path=src/server/realtime/sse.ts lines=18:120
@source apply title="Apply event to cache" path=src/shared/apply-board-event.ts lines=13:40

## What are the moving parts? {#parts}

@architecture id=move-arch title="Move-card runtime map"
| ui | Board UI | frontend |
| cache | Query cache | frontend |
| api | Route handler | security |
| svc | Card service | backend |
| db | PostgreSQL | database |
| bus | Event bus | messagebus |
| sse | SSE stream | backend |
| peers | Other sessions | frontend |
| ui > cache | optimistic move |
| cache > api | PATCH /move |
| api > svc | validated input |
| svc > db | locked transaction |
| svc > bus | after commit |
| bus > sse | publish event |
| sse > peers | card.moved |

The request path is one direction: UI to cache, cache to route handler, handler to service, service to the database. The event path branches after commit, so a slow reader never holds the transaction open.

## What happens on drop, step by step? {#steps}

@sequence id=move-seq title="Dropping a card"
| actor ui | Browser UI | frontend |
| actor cache | Query cache | frontend |
| actor api | Route handler | security |
| actor svc | Card service | backend |
| actor db | PostgreSQL | database |
| actor bus | Event bus | messagebus |
| actor sse | SSE stream | backend |
| actor peers | Other sessions | frontend |
| phase | 1 · Optimistic UI |
| ui | cache | prepare and apply optimistic move |
| phase | 2 · Commit |
| cache | api | PATCH /api/cards/:id/move |
| api | svc | validate, then cardService.move |
| svc | db | lock board, read neighbours |
| svc | db | UPDATE position, INSERT activity |
| db | svc | committed row |
| svc | bus | publish card.moved | emphasis |
| svc | api | Card DTO |
| api | cache | 200 JSON |
| cache | ui | reconcile, clear pending |
| phase | 3 · Fan-out |
| bus | sse | card.moved event |
| sse | peers | event: card.moved |

@steps id=move-steps
| Drop | Browser drag end | `drag-board.tsx` calls `useMoveCard`, which runs `commitCardMove`. The cache gets the optimistic position before the fetch starts. | move-seq | cache |
| Request | PATCH /api/cards/:id/move | `requireUser` verifies the session cookie and applies a 120 writes per minute limit. `cardMoveSchema` parses the drop. | move-seq | api |
| Transaction | Lock and write | `mutate` locks the board row, computes the fractional key from `previousId` and `nextId`, updates the card and writes `CARD_MOVED` activity. | move-seq | svc |
| Publish | After commit | The event is published only after the transaction resolves. A publish failure is logged, not returned. | move-seq | bus |
| Fan-out | SSE to peers | The stream writes `event: card.moved` frames and a heartbeat every 15 seconds. Peers apply the event to their cache. | move-seq | peers |

@code id=route-code source=route language=ts

## Why is the drop optimistic, and how does it recover? {#recovery}

The screen must not wait for a round trip. The client cancels in-flight board queries, snapshots the card's original column and position, then applies the new slot. If the request fails, it restores that snapshot before showing the error.

| Situation | What the client does |
| --- | --- |
| Server accepts | Keeps the optimistic card, then reconciles with the returned DTO |
| 409, 404 or 5xx | Reverts the snapshot and refetches the board |
| Other 4xx | Reverts the snapshot only |

@callout id=stale level=warning title="Concurrent moves can still lose the slot"
If another move fills the same gap first, `positionInGap` appends behind it. If the anchors no longer line up, the service retries the ordering transaction up to three times, then returns `409 STALE_ORDER`. The client reverts and refetches.

## What does the server trust from the browser? {#trust}

Very little. The request carries a target column and the two neighbour IDs, not an absolute position. The service reads the current siblings, checks the gap is still valid, and generates a fractional key with `generateKeyBetween`.

@facts id=trust-facts
| Sent by the client | columnId, previousId, nextId |
| Ignored by the server | any absolute position |
| Recomputed by | positionInGap from neighbour positions |
| Ordering retry | up to 3 attempts on a repository conflict |
| Hard failure | 409 STALE_ORDER, then revert and refetch |
| Write identity | X-Client-Id is stored as originClientId on the event |
