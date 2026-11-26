import { AppError, BadRequestError } from "./errors";

export async function readJsonBody(request: Request): Promise<unknown> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new AppError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Expected application/json",
    );
  }
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }
}
