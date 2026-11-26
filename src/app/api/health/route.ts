import { withErrorHandling } from "@/server/http/handler";

export const GET = withErrorHandling(() => Response.json({ status: "ok" }));
