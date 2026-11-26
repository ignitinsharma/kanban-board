import { z } from "zod";

function positiveInteger(fallback: number) {
  return z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.int().min(1).max(2_147_483_647))
    .default(fallback);
}

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
  JWT_SECRET: z.string().trim().min(32),
  DB_POOL_MAX: positiveInteger(5),
  DB_IDLE_TIMEOUT_MS: positiveInteger(30_000),
  DB_CONNECT_TIMEOUT_MS: positiveInteger(15_000),
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
