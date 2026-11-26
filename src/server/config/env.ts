import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
  JWT_SECRET: z
    .string()
    .refine((value) => new TextEncoder().encode(value.trim()).length >= 32, {
      message: "Must contain at least 32 bytes",
    }),
  NODE_ENV: z.enum(["development", "test", "production"]),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const fields = result.error.issues.map(
    ({ path, message }) => `${path.join(".")} (${message})`,
  );
  throw new Error(`Invalid server environment: ${fields.join(", ")}`);
}

export const env = result.data;
