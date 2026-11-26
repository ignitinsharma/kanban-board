import { ZodError } from "zod";
import { AppError, RateLimitError } from "./errors";

export function errorToResponse(error: unknown): Response {
  if (error instanceof AppError && error.status < 500) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      {
        status: error.status,
        headers:
          error instanceof RateLimitError
            ? { "Retry-After": String(error.retryAfter) }
            : undefined,
      },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request input" } },
      { status: 400 },
    );
  }

  console.error(error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 },
  );
}
