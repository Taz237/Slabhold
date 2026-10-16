import { getSoldComps } from "@/lib/comps";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";
  const playerName = searchParams.get("player")?.trim() ?? "";
  const yearRaw = searchParams.get("year")?.trim() ?? "";
  const setBrand = searchParams.get("set")?.trim() ?? "";
  const cardNumber = searchParams.get("number")?.trim() ?? "";
  const grade = searchParams.get("grade")?.trim() ?? "";
  const estimatedRaw = searchParams.get("est")?.trim() ?? "";

  const year = Number(yearRaw);
  if (!id || !playerName || !setBrand || !Number.isFinite(year) || year < 1900) {
    return Response.json(
      { error: "id, player, year, and set are required" },
      { status: 400 },
    );
  }

  const estimatedSellPrice = Number(estimatedRaw);
  const payload = await getSoldComps({
    id,
    playerName,
    year,
    setBrand,
    cardNumber: cardNumber || undefined,
    grade: grade || undefined,
    estimatedSellPrice: Number.isFinite(estimatedSellPrice)
      ? estimatedSellPrice
      : undefined,
  });

  return Response.json(payload);
}
