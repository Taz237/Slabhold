import "server-only";

import { createHash } from "node:crypto";

let missingSaltWarned = false;

/**
 * Server salt for the anonymous IP hash. Missing salt keeps the previous
 * unsalted hash and warns once. Changing the salt resets anon buckets.
 */
function ipHashSalt(): string {
  const salt = process.env.RATE_LIMIT_SALT?.trim() ?? "";
  if (salt) return salt;
  if (!missingSaltWarned) {
    missingSaltWarned = true;
    console.warn(
      "[anon_rate_limits] RATE_LIMIT_SALT is not set. Anonymous rate limits use the unsalted IP hash.",
    );
  }
  return "";
}

/** Hash so anon_rate_limits stores a subject key, not the raw IP. */
export function anonymousSubject(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  const salt = ipHashSalt();
  const material = salt ? `${salt}:card-values:${ip}` : `card-values:${ip}`;
  return createHash("sha256").update(material).digest("hex");
}
