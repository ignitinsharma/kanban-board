import type { PublicUser } from "./auth";
import type { CardPriority } from "./kanban";

type Timestamped = { createdAt: string; updatedAt: string };

export type Board = Timestamped & { id: string; name: string; ownerId: string };
export type BoardMember = PublicUser;
export type Column = Timestamped & {
  id: string;
  boardId: string;
  name: string;
  position: string;
};
export type Card = Timestamped & {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: CardPriority;
  assigneeId: string | null;
  position: string;
};
export type BoardDetail = Board & {
  members: BoardMember[];
  columns: Column[];
  cards: Card[];
};
