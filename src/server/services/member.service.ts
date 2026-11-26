import { AppError, NotFoundError } from "../http/errors";
import {
  boardDependencies,
  enforceLimit,
  lockBoard,
  mutate,
  type Actor,
  type BoardDependencies,
} from "./board-context";

export function createMemberService(deps: BoardDependencies) {
  return {
    add(boardId: string, email: string, actor: Actor) {
      return mutate(deps, async (db) => {
        await lockBoard(db, boardId, actor.actorId);
        const entity = await db.members.findUser(email);
        if (!entity) throw new NotFoundError("User not found");
        if (await db.members.find(boardId, entity.id))
          throw new AppError(409, "CONFLICT", "User is already a board member");
        enforceLimit(
          await db.members.count(boardId),
          20,
          "A board can have at most 20 members",
        );
        await db.members.add(boardId, entity.id);
        await db.activity.write({
          boardId,
          actorId: actor.actorId,
          action: "MEMBER_ADDED",
          metadata: {
            memberId: entity.id,
            name: entity.name,
            email: entity.email,
          },
        });
        return {
          result: entity,
          event: { ...actor, boardId, type: "member.added", entity },
        };
      });
    },
  };
}

export const memberService = createMemberService(boardDependencies);
