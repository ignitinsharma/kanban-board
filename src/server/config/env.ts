import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
  JWT_SECRET: z.string().trim().min(32),
  NODE_ENV: z.enum(["development", "test", "production"]),
});

export function getEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const fields = result.error.issues.map(
      ({ path, message }) => `${path.join(".")} (${message})`,
    );
    throw new Error(`Invalid server environment: ${fields.join(", ")}`);
  }

  return result.data;
}
