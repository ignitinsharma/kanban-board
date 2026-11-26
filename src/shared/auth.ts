import { z } from "./validation";
import { emailSchema, nameSchema } from "./kanban";

const passwordBytes = (value: string) => new TextEncoder().encode(value).length;

export const registerSchema = z.strictObject({
  email: emailSchema,
  name: nameSchema,
  password: z.string().refine((value) => {
    const bytes = passwordBytes(value);
    return bytes >= 8 && bytes <= 72;
  }, "Password must be 8 to 72 bytes."),
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z
    .string()
    .min(1)
    .refine((value) => passwordBytes(value) <= 72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PublicUser = { id: string; email: string; name: string };
