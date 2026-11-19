import type { Metadata } from "next";
import { ProfileCardsView } from "@/components/profile/profile-cards-view";
import { previewMetadata } from "@/lib/social/link-preview";
import { loadProfilePreview } from "@/lib/social/link-preview-load";
import { requireProfile } from "@/lib/social/require-record";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return previewMetadata(await loadProfilePreview(username));
}

/**
 * /u/<handle>/cards: every public card a collector shares, as the grid the
 * profile's Cards tab used to hold. The profile's carousel ends in "See all",
 * which opens this, and old `?tab=cards` links land here.
 */
export default async function ProfileCardsPage({ params }: Props) {
  const { username } = await params;
  const name = decodeURIComponent(username);
  await requireProfile(name);
  return <ProfileCardsView username={name} />;
}
