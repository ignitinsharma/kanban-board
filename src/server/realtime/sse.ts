import type { BoardEvent } from "@/shared/events";
import type { EventBus } from "./event-bus";

const encoder = new TextEncoder();
const bufferLimit = 64 * 1024;
const queueLimit = 128 * 1024;

type StreamOptions = {
  boardId: string;
  expiresAt: number;
  signal: AbortSignal;
  events: EventBus<BoardEvent>;
  authorize: () => Promise<void>;
  release: () => void;
};

export function boardEventStream(options: StreamOptions) {
  const { boardId, signal, events, authorize, release } = options;
  const deadline = Math.min(options.expiresAt, Date.now() + 55 * 60_000);
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  let busy = false;
  let verifyIdle = false;
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let membership: ReturnType<typeof setInterval> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const pending: Uint8Array[] = [];
  let bytes = 0;

  function cleanup() {
    if (closed) return false;
    closed = true;
    unsubscribe?.();
    signal.removeEventListener("abort", end);
    clearInterval(heartbeat);
    clearInterval(membership);
    clearTimeout(expiry);
    pending.length = 0;
    bytes = 0;
    release();
    return true;
  }

  function end() {
    if (cleanup()) controller.close();
  }

  function active() {
    if (Date.now() >= deadline) end();
    return !closed;
  }

  function send(frame: Uint8Array) {
    if (!active()) return;
    if ((controller.desiredSize ?? 0) < frame.byteLength) end();
    else controller.enqueue(frame);
  }

  async function drain() {
    if (busy || !active()) return;
    busy = true;
    try {
      while (active() && (pending.length || verifyIdle)) {
        const next = pending[0];
        verifyIdle = false;
        await authorize();
        if (!active()) break;
        if (next) {
          pending.shift();
          bytes -= next.byteLength;
          send(next);
        }
      }
    } catch {
      end();
    } finally {
      busy = false;
    }
  }

  return new ReadableStream<Uint8Array>(
    {
      start(streamController) {
        controller = streamController;
        try {
          if (signal.aborted || !active()) {
            end();
            return;
          }
          signal.addEventListener("abort", end, { once: true });
          unsubscribe = events.subscribe(boardId, (event) => {
            if (!active() || event.boardId !== boardId) return;
            const frame = encoder.encode(
              `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            );
            if (event.type === "board.deleted") {
              send(frame);
              end();
              return;
            }
            if (pending.length >= 16 || bytes + frame.byteLength > queueLimit) {
              end();
              return;
            }
            pending.push(frame);
            bytes += frame.byteLength;
            void drain();
          });
          heartbeat = setInterval(
            () => send(encoder.encode(": heartbeat\n\n")),
            15_000,
          );
          membership = setInterval(() => {
            verifyIdle = true;
            void drain();
          }, 60_000);
          expiry = setTimeout(end, Math.max(0, deadline - Date.now()));
          send(encoder.encode(": connected\nretry: 3000\n\n"));
        } catch (error) {
          if (cleanup()) controller.error(error);
        }
      },
      cancel() {
        cleanup();
      },
    },
    new ByteLengthQueuingStrategy({ highWaterMark: bufferLimit }),
  );
}
