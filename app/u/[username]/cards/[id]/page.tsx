import type { Metadata } from "next";
import { PublicCardView } from "@/components/public-card-view";
import { getPublicCardComps } from "@/lib/comps/public";
import { previewMetadata } from "@/lib/social/link-preview";
import { loadPublicCardPreview } from "@/lib/social/link-preview-load";
import { requirePublicCard } from "@/lib/social/require-record";

type Props = { params: Promise<{ username: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return previewMetadata(await loadPublicCardPreview(id));
}

export default async function PublicCardPage({ params }: Props) {
  const { username, id } = await params;
  await requirePublicCard(username, id);
  const publicComps = await getPublicCardComps(id);
  return <PublicCardView username={username} id={id} publicComps={publicComps} />;
}
