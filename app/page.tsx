import { FeedView } from "@/components/feed-view";
import { MovingTodaySlot } from "@/components/moving-today-slot";

export default function Home() {
  return <FeedView movingToday={<MovingTodaySlot />} />;
}
