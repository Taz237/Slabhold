import { ProfileCardsSkeleton } from "@/components/profile/profile-cards-skeleton";

/** Paints on tap while the cards page loads: the header row and a grid of slots, so nothing moves. */
export default function ProfileCardsLoading() {
  return <ProfileCardsSkeleton />;
}
