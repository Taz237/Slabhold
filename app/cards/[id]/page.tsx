import type { Metadata } from "next";
import { CardDetail } from "@/components/card-detail";
import { cardOgImagePath, previewMetadata, withCardOgImage } from "@/lib/social/link-preview";
import { loadPublicCardPreview } from "@/lib/social/link-preview-load";
import { requireCardPageAccess } from "@/lib/value/require-card-page-access";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const preview = await loadPublicCardPreview(id);
  return withCardOgImage(previewMetadata(preview), cardOgImagePath(id, preview.updatedAt));
}

export default async function CardDetailPage({ params }: Props) {
  const { id } = await params;
  await requireCardPageAccess(id);
  return <CardDetail id={id} />;
}
