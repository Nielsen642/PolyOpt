import type { Request, Response, NextFunction } from "express";
import type { AppConfig } from "./config";

type Bucket = { count: number; windowStart: number };

function clientKey(req: Request): string {
  const xf = req.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return req.socket.remoteAddress || "unknown";
}

export function createRateLimiter(config: AppConfig, kind: "api" | "auth") {
  const windowMs = kind === "auth" ? config.authRateLimitWindowMs : config.apiRateLimitWindowMs;
  const max = kind === "auth" ? config.authRateLimitMax : config.apiRateLimitMax;
  const buckets = new Map<string, Bucket>();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!config.proMode) {
      return next();
    }
    const key = clientKey(req);
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now - b.windowStart >= windowMs) {
      b = { count: 0, windowStart: now };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ message: "Too many requests. Try again shortly." });
    }
    next();
  };
}
