import { loadCardPeople } from "@/lib/cards/owners";
import { requireCardPageAccess } from "@/lib/value/require-card-page-access";

export const runtime = "nodejs";

/**
 * Owners and hunters for the card actions menu.
 * Kept off /cards/[id] so opening a card does not wait on this query.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }
  await requireCardPageAccess(id);
  const people = await loadCardPeople(id);
  return Response.json(people, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
