import type { Metadata } from "next";
import { CardDetail } from "@/components/card-detail";
import { isAddedParam } from "@/lib/cards/added-panel";
import { cardOgImagePath, previewMetadata, withCardOgImage } from "@/lib/social/link-preview";
import { loadPublicCardPreview } from "@/lib/social/link-preview-load";
import { requireCardPageAccess } from "@/lib/value/require-card-page-access";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ added?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const preview = await loadPublicCardPreview(id);
  return withCardOgImage(previewMetadata(preview), cardOgImagePath(id, preview.updatedAt));
}

export default async function CardDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  // The owner check and the query string don't depend on each other.
  const [, { added }] = await Promise.all([requireCardPageAccess(id), searchParams]);
  return <CardDetail id={id} added={isAddedParam(added)} />;
}
