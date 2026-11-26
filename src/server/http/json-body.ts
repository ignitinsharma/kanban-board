import { AppError, BadRequestError } from "./errors";

const maxBytes = 64 * 1024;
const maxDepth = 32;

function tooLarge() {
  return new AppError(413, "PAYLOAD_TOO_LARGE", "JSON body exceeds 64 KB");
}

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
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw tooLarge();
  if (!request.body) throw new BadRequestError("Invalid JSON body");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw tooLarge();
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof AppError) throw error;
    throw new BadRequestError("Invalid JSON body");
  } finally {
    reader.releaseLock();
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  while (stack.length) {
    const item = stack.pop()!;
    if (!item.value || typeof item.value !== "object") continue;
    if (item.depth >= maxDepth)
      throw new BadRequestError("JSON body is nested too deeply");
    for (const child of Object.values(item.value))
      stack.push({ value: child, depth: item.depth + 1 });
  }
  return value;
}
