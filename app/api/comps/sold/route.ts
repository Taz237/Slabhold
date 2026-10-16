import { getSoldComps } from "@/lib/comps";
import {
  consumeRequestLimit,
  consumeTrawlLimit,
  RATE_LIMIT_MESSAGE,
} from "@/lib/comps/rate-limit";
import { getAuthUserId } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const userId = await getAuthUserId();
  if (!userId) {
    return Response.json({ error: "Log in to see sold comps" }, { status: 401 });
  }

  const allowed = await consumeRequestLimit(userId);
  if (!allowed) {
    return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";
  const playerName = searchParams.get("player")?.trim() ?? "";
  const yearRaw = searchParams.get("year")?.trim() ?? "";
  const setBrand = searchParams.get("set")?.trim() ?? "";
  const cardNumber = searchParams.get("number")?.trim() ?? "";
  const grade = searchParams.get("grade")?.trim() ?? "";
  const parallel = searchParams.get("parallel")?.trim() ?? "";
  const estimatedRaw = searchParams.get("est")?.trim() ?? "";

  const year = Number(yearRaw);
  if (!id || !playerName || !setBrand || !Number.isFinite(year) || year < 1900) {
    return Response.json(
      { error: "id, player, year, and set are required" },
      { status: 400 },
    );
  }

  const estimatedSellPrice = Number(estimatedRaw);
  const result = await getSoldComps(
    {
      id,
      playerName,
      year,
      setBrand,
      cardNumber: cardNumber || undefined,
      grade: grade || undefined,
      parallel: parallel || undefined,
      estimatedSellPrice: Number.isFinite(estimatedSellPrice)
        ? estimatedSellPrice
        : undefined,
    },
    {
      beforeTrawl: () => consumeTrawlLimit(userId),
    },
  );

  if (!result.ok) {
    return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  return Response.json(result.payload);
}
