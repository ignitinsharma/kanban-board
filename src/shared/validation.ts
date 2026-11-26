import { z } from "zod";

// Production CSP blocks the generated parser and Zod's eval capability probe.
if (typeof window !== "undefined") z.config({ jitless: true });

export { z };
