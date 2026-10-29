import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MovingTodayAll } from "@/components/moving-today-page";
import { getMovingToday } from "@/lib/moving-today/load";
import { defaultDirection, parseDirection, parseSport } from "@/lib/moving-today/rail";
import { movingTodayDescription } from "@/lib/moving-today/rank";
import { MOVING_TODAY_TITLE, shouldShowMovingToday } from "@/lib/moving-today/types";
import { getAuthUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;

export async function generateMetadata(): Promise<Metadata> {
  try {
    const payload = await getMovingToday();
    const title = shouldShowMovingToday(payload.sales) ? payload.title : MOVING_TODAY_TITLE;
    return {
      title,
      description: movingTodayDescription(title),
    };
  } catch {
    return {
      title: MOVING_TODAY_TITLE,
      description: movingTodayDescription(MOVING_TODAY_TITLE),
    };
  }
}

/**
 * See all: every public card, movers first. `?dir=up|down|all` and
 * `?sport=football` keep the filters shareable and restore them on Back.
 * With no cards at all, the page shows its empty state instead of leaving.
 */
export default async function MovingTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ dir?: SearchValue; sport?: SearchValue }>;
}) {
  const params = await searchParams;
  let payload;
  try {
    payload = await getMovingToday();
  } catch {
    redirect("/");
  }
  const empty = !shouldShowMovingToday(payload.sales);
  if (empty) payload = { ...payload, sales: [], moverCount: 0, totalCount: 0 };
  // Only the empty state needs to know who is looking.
  const signedIn = empty ? Boolean(await getAuthUserId().catch(() => null)) : false;
  const initialDirection = parseDirection(params.dir) ?? defaultDirection(payload);
  return (
    <MovingTodayAll
      payload={payload}
      initialDirection={initialDirection}
      initialSport={parseSport(params.sport)}
      signedIn={signedIn}
    />
  );
}
