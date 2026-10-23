import type { Metadata } from "next";
import { PublicCardView } from "@/components/public-card-view";
import { loadCardPeople } from "@/lib/cards/owners";
import { getPublicCardComps } from "@/lib/comps/public";
import { cardOgImagePath, previewMetadata, withCardOgImage } from "@/lib/social/link-preview";
import { loadPublicCardPreview } from "@/lib/social/link-preview-load";
import { requirePublicCard } from "@/lib/social/require-record";

type Props = { params: Promise<{ username: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, id } = await params;
  const preview = await loadPublicCardPreview(id);
  return withCardOgImage(
    previewMetadata(preview),
    cardOgImagePath(id, preview.updatedAt, username),
  );
}

export default async function PublicCardPage({ params }: Props) {
  const { username, id } = await params;
  const record = await requirePublicCard(username, id);
  const [publicComps, people] = await Promise.all([
    getPublicCardComps(id),
    loadCardPeople(id),
  ]);
  return (
    <PublicCardView
      username={username}
      id={id}
      publicComps={publicComps}
      people={people}
      profile={record.profile}
      card={record.card}
    />
  );
}
