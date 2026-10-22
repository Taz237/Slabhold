import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MovingTodayPanel } from "@/components/moving-today";
import { getMovingToday } from "@/lib/moving-today/load";
import { MOVING_TODAY_TITLE, shouldShowMovingToday } from "@/lib/moving-today/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const payload = await getMovingToday();
    const title = shouldShowMovingToday(payload.sales) ? payload.title : MOVING_TODAY_TITLE;
    return {
      title,
      description: `${title} across the Slabhold catalog.`,
    };
  } catch {
    return {
      title: MOVING_TODAY_TITLE,
      description: "Notable sales across the Slabhold catalog.",
    };
  }
}

export default async function MovingTodayPage() {
  let payload;
  try {
    payload = await getMovingToday();
  } catch {
    redirect("/");
  }
  if (!shouldShowMovingToday(payload.sales)) redirect("/");
  return (
    <MovingTodayPanel heading={payload.title} dateLabel={payload.dateLabel} sales={payload.sales} />
  );
}
