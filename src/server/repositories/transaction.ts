import { getPrisma } from "../db/prisma";
import {
  createRepositories,
  type KanbanRepositories,
} from "./kanban.repository";

export class RepositoryConflict extends Error {
  constructor(readonly target: unknown) {
    super("Unique constraint violation");
  }
}

export class RepositoryNotFound extends Error {}

export type RunInTransaction = <Result>(
  work: (repositories: KanbanRepositories) => Promise<Result>,
) => Promise<Result>;

export const runInTransaction: RunInTransaction = async (work) => {
  try {
    return await getPrisma().$transaction(
      (tx) => work(createRepositories(tx)),
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      if (error.code === "P2002") {
        throw new RepositoryConflict("meta" in error ? error.meta : undefined);
      }
      if (error.code === "P2025") throw new RepositoryNotFound();
    }
    throw error;
  }
};
