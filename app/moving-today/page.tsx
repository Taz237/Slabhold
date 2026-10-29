import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MovingTodayAll } from "@/components/moving-today";
import { getMovingToday } from "@/lib/moving-today/load";
import { defaultDirection, parseDirection } from "@/lib/moving-today/rail";
import { movingTodayDescription } from "@/lib/moving-today/rank";
import { MOVING_TODAY_TITLE, shouldShowMovingToday } from "@/lib/moving-today/types";

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

/** See all movers. `?dir=up|down` keeps the toggle shareable and restores it on Back. */
export default async function MovingTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ dir?: SearchValue }>;
}) {
  const params = await searchParams;
  let payload;
  try {
    payload = await getMovingToday();
  } catch {
    redirect("/");
  }
  if (!shouldShowMovingToday(payload.sales)) redirect("/");
  const initialDirection = parseDirection(params.dir) ?? defaultDirection(payload.sales);
  return <MovingTodayAll payload={payload} initialDirection={initialDirection} />;
}
