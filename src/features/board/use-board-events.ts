"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { subscribeToBoard, type ConnectionState } from "./board-subscription";

export function useBoardEvents(
  boardId: string,
  clientId: string,
  onUnauthorized?: () => void,
) {
  const query = useQueryClient();
  const [state, setState] = useState<ConnectionState>("connecting");

  const callback = useRef(onUnauthorized);
  useEffect(() => {
    callback.current = onUnauthorized;
  }, [onUnauthorized]);

  useEffect(
    () =>
      subscribeToBoard(query, boardId, setState, undefined, () =>
        callback.current?.(),
      ),
    [query, boardId, clientId],
  );

  return state;
}
