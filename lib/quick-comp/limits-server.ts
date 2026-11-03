import "server-only";

import { consumeRateLimit, consumeTrawlLimit } from "@/lib/comps/rate-limit";
import {
  QUICK_COMP_DAILY_LIMIT,
  QUICK_COMP_DAY_BUCKET,
  QUICK_COMP_DAY_MS,
  type QuickCompLimitDeps,
} from "./limits";

/** One Quick Comp lookup against today's cap. Fails closed after a lost write. */
export function consumeQuickCompDayLimit(userId: string): Promise<boolean> {
  return consumeRateLimit(userId, QUICK_COMP_DAY_BUCKET, QUICK_COMP_DAY_MS, QUICK_COMP_DAILY_LIMIT);
}

export const serverQuickCompLimits: QuickCompLimitDeps = {
  consumeDaily: consumeQuickCompDayLimit,
  consumeHourly: consumeTrawlLimit,
};
