import { quickCompEnabled } from "@/lib/quick-comp/flag";
import { getQuickComp } from "@/lib/quick-comp/lookup";
import { respondQuickComp } from "@/lib/quick-comp/respond";
import { getAuthUserId } from "@/lib/supabase/server";

export const maxDuration = 15;

export async function GET(request: Request) {
  return respondQuickComp(request, {
    enabled: () => quickCompEnabled(),
    userId: getAuthUserId,
    lookup: (identity, userId) => getQuickComp(identity, userId),
  });
}
