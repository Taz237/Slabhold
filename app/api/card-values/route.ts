import { getCardValue, getCardValues } from "@/lib/value/getCardValue";
import type { CardValueResult } from "@/lib/value/types";

export const runtime = "nodejs";

/**
 * Read trusted card values (card_values only — never Trawl).
 * GET ?id=  or  GET ?ids=a,b,c
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const single = searchParams.get("id")?.trim() ?? "";
  const many = searchParams.get("ids")?.trim() ?? "";

  if (single) {
    const value = await getCardValue(single);
    return Response.json({ id: single, value });
  }

  if (!many) {
    return Response.json({ error: "id or ids is required" }, { status: 400 });
  }

  const ids = many
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 500);

  const map = await getCardValues(ids);
  const values: Record<string, CardValueResult> = {};
  for (const id of ids) {
    values[id] = map.get(id) ?? {
      status: "unavailable",
      median: null,
      low: null,
      high: null,
      nSales: 0,
      matchedAt: null,
    };
  }

  return Response.json({ values });
}
