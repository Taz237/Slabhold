import { VouchesPageSkeleton } from "@/components/vouches/vouches-skeleton";

/** Paints on tap while the page loads: the same frame the vouches page draws next. */
export default function VouchesLoading() {
  return <VouchesPageSkeleton />;
}
