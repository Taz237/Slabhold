import { redirect } from "next/navigation";
import { MovingTodayPanel } from "@/components/moving-today";
import { getMovingToday } from "@/lib/moving-today/load";
import { MOVING_TODAY_TITLE, shouldShowMovingToday } from "@/lib/moving-today/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: MOVING_TODAY_TITLE,
  description: "Today's notable sales across the Slabhold catalog.",
};

export default async function MovingTodayPage() {
  let payload;
  try {
    payload = await getMovingToday();
  } catch {
    redirect("/");
  }
  if (!shouldShowMovingToday(payload.sales)) redirect("/");
  return (
    <MovingTodayPanel status="ready" dateLabel={payload.dateLabel} sales={payload.sales} />
  );
}
