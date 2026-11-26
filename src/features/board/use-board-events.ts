"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { subscribeToBoard, type ConnectionState } from "./board-subscription";

export function useBoardEvents(boardId: string, clientId: string) {
  const query = useQueryClient();
  const [state, setState] = useState<ConnectionState>("connecting");

  useEffect(
    () => subscribeToBoard(query, boardId, setState),
    [query, boardId, clientId],
  );

  return state;
}
