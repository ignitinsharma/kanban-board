import { AppError } from "./errors";
import { errorToResponse } from "./error-response";

export function withErrorHandling<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Response | Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      const origin = request.headers.get("origin");
      if (
        origin !== null &&
        request.method !== "GET" &&
        request.method !== "HEAD"
      ) {
        const parsed = URL.parse(origin);
        const host = request.headers.get("host") ?? new URL(request.url).host;
        if (
          !parsed ||
          parsed.origin !== origin ||
          parsed.host !== host ||
          !["http:", "https:"].includes(parsed.protocol)
        ) {
          throw new AppError(
            403,
            "FORBIDDEN",
            "Origin does not match request host",
          );
        }
      }
      return await handler(request, ...args);
    } catch (error) {
      return errorToResponse(error);
    }
  };
}
