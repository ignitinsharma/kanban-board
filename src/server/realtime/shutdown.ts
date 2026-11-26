import { setMaxListeners } from "node:events";

const processState = globalThis as typeof globalThis & {
  kanbanShutdown?: AbortController;
};

export function shutdownSignal(): AbortSignal {
  if (processState.kanbanShutdown) return processState.kanbanShutdown.signal;
  const controller = new AbortController();
  processState.kanbanShutdown = controller;
  // The stream admission cap bounds the number of listeners.
  setMaxListeners(0, controller.signal);
  process.once("SIGTERM", () => controller.abort());
  return controller.signal;
}
