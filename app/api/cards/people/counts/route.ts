import { loadCardPeople } from "@/lib/cards/owners";
import { respondPeopleCounts } from "@/lib/cards/people-counts-respond";
import { requireCardPageAccess } from "@/lib/value/require-card-page-access";

export const runtime = "nodejs";

/** Owners and hunters as two counts, for the card-added screen after a scan. */
export async function GET(request: Request) {
  return respondPeopleCounts(request, { access: requireCardPageAccess, load: loadCardPeople });
}
