import { errorToResponse } from "./error-response";

export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Response | Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorToResponse(error);
    }
  };
}
