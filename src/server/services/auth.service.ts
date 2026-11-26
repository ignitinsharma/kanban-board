import type { LoginInput, PublicUser, RegisterInput } from "@/shared/auth";
import { AppError, UnauthorizedError } from "../http/errors";
import {
  DuplicateEmailError,
  userRepository,
  type UserRepository,
} from "../repositories/user.repository";
import { hashPassword, verifyPassword } from "../security/password";

const dummyHash =
  "$2b$12$Q3HkCB9wIu0ooPuA.Ivsd.2wTcDfMSt1OhsbDL3Sp5p6hjJTckctW";

export function createAuthService(
  users: UserRepository,
  passwords = { hash: hashPassword, verify: verifyPassword },
) {
  return {
    async register(input: RegisterInput): Promise<PublicUser> {
      const { email, name } = input;
      const passwordHash = await passwords.hash(input.password);
      try {
        const user = await users.create({
          email: email.trim().toLowerCase(),
          name,
          passwordHash,
        });
        return { id: user.id, email: user.email, name: user.name };
      } catch (error) {
        if (error instanceof DuplicateEmailError) {
          throw new AppError(409, "CONFLICT", "Email is already registered");
        }
        throw error;
      }
    },

    async login(input: LoginInput): Promise<PublicUser> {
      const user = await users.findByEmail(input.email.trim().toLowerCase());
      const valid = await passwords.verify(
        input.password,
        user?.passwordHash ?? dummyHash,
      );
      if (!user || !valid)
        throw new UnauthorizedError("Invalid email or password");
      return { id: user.id, email: user.email, name: user.name };
    },
  };
}

export const authService = createAuthService(userRepository);
