import { FeedView } from "@/components/feed-view";
import { MovingTodaySlot } from "@/components/moving-today-slot";

export const revalidate = 1800;

export default function Home() {
  return <FeedView movingToday={<MovingTodaySlot />} />;
}
