import type { Board, BoardMember, Card, Column } from "./board";

type EventPayloads = {
  "board.updated": Board;
  "board.deleted": { id: string };
  "member.added": BoardMember;
  "column.created": Column;
  "column.updated": Column;
  "column.moved": Column;
  "column.deleted": { id: string };
  "card.created": Card;
  "card.updated": Card;
  "card.moved": Card;
  "card.deleted": { id: string };
};

export type BoardEvent = {
  [Type in keyof EventPayloads]: {
    type: Type;
    boardId: string;
    actorId: string;
    originClientId: string | null;
    entity: EventPayloads[Type];
  };
}[keyof EventPayloads];
