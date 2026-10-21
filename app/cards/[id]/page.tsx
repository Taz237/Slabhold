import type { Metadata } from "next";
import { CardDetail } from "@/components/card-detail";
import { loadCardPeople } from "@/lib/cards/owners";
import { previewMetadata } from "@/lib/social/link-preview";
import { loadPublicCardPreview } from "@/lib/social/link-preview-load";
import { requireCardPageAccess } from "@/lib/value/require-card-page-access";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return previewMetadata(await loadPublicCardPreview(id));
}

export default async function CardDetailPage({ params }: Props) {
  const { id } = await params;
  await requireCardPageAccess(id);
  const people = await loadCardPeople(id);
  return <CardDetail id={id} people={people} />;
}
