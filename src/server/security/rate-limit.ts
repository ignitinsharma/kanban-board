import { isIP } from "node:net";

export interface RateLimiter {
  // Returns zero when allowed, or the number of seconds until the window resets.
  consume(
    key: string,
    limit: number,
    windowMs: number,
  ): number | Promise<number>;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly entries = new Map<
    string,
    { count: number; expiresAt: number }
  >();
  private nextCleanup = 0;

  constructor(private readonly now = Date.now) {}

  consume(key: string, limit: number, windowMs: number) {
    const now = this.now();
    if (now >= this.nextCleanup) {
      this.cleanup(now);
      this.nextCleanup = now + 60_000;
    }

    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.entries.set(key, { count: 1, expiresAt: now + windowMs });
      return 0;
    }

    if (entry.count >= limit) return Math.ceil((entry.expiresAt - now) / 1000);
    entry.count += 1;
    return 0;
  }

  cleanup(now = this.now()) {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}

export function getClientIp(request: Request) {
  if (process.env.RENDER !== "true") return "unknown";

  // Cloudflare overwrites CF-Connecting-IP on public Render ingress.
  const connectingIp = request.headers.get("cf-connecting-ip");
  if (connectingIp && isIP(connectingIp)) return connectingIp;

  // The ingress appends the visitor address. Earlier entries may be supplied
  // by the caller. Never walk backward if the final entry is invalid.
  const forwarded = request.headers.get("x-forwarded-for");
  const lastIp = forwarded?.slice(forwarded.lastIndexOf(",") + 1).trim();
  return lastIp && isIP(lastIp) ? lastIp : "unknown";
}

export const authRateLimiter: RateLimiter = new MemoryRateLimiter();
