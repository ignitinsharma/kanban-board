import type { PublicUser } from "@/shared/auth";
import { getPrisma } from "../db/prisma";

export class DuplicateEmailError extends Error {}

type Credentials = PublicUser & { passwordHash: string };

export interface UserRepository {
  findByEmail(email: string): Promise<Credentials | null>;
  findById(id: string): Promise<PublicUser | null>;
  create(input: Omit<Credentials, "id">): Promise<PublicUser>;
}

const publicFields = { id: true, email: true, name: true } as const;

export const userRepository: UserRepository = {
  findByEmail(email) {
    return getPrisma().user.findUnique({ where: { email } });
  },
  findById(id) {
    return getPrisma().user.findUnique({ where: { id }, select: publicFields });
  },
  async create(data) {
    try {
      return await getPrisma().user.create({ data, select: publicFields });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "P2002") {
        throw new DuplicateEmailError();
      }
      throw error;
    }
  },
};
