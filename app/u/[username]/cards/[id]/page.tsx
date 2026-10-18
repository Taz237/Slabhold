import type { Metadata } from "next";
import { PublicCardView } from "@/components/public-card-view";
import { previewMetadata } from "@/lib/social/link-preview";
import { loadPublicCardPreview } from "@/lib/social/link-preview-load";

type Props = { params: Promise<{ username: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return previewMetadata(await loadPublicCardPreview(id));
}

export default async function PublicCardPage({ params }: Props) {
  const { username, id } = await params;
  return <PublicCardView username={username} id={id} />;
}
