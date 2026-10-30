import type { Metadata } from "next";
import { CardDetail } from "@/components/card-detail";
import { SeededViewer } from "@/components/viewer-seed";
import { isAddedParam } from "@/lib/cards/added-panel";
import { loadViewerSeed } from "@/lib/collection/load-viewer-seed";
import { cardOgImagePath, previewMetadata, withCardOgImage } from "@/lib/social/link-preview";
import { loadPublicCardPreview } from "@/lib/social/link-preview-load";
import { requestViewer } from "@/lib/supabase/request-viewer";
import { getAuthUserId } from "@/lib/supabase/server";
import { cardPageAccessWith, requireCardPageAccess } from "@/lib/value/require-card-page-access";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ added?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const preview = await loadPublicCardPreview(id);
  return withCardOgImage(previewMetadata(preview), cardOgImagePath(id, preview.updatedAt));
}

/**
 * Owner-only, checked before anything renders. The access check, the query
 * string, and (on a full page load) the viewer's cards for the first paint
 * all run at once. The cards read goes through the viewer's own cookie
 * client, so RLS keeps it to their rows whatever the check decides.
 */
export default async function CardDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const viewerTask = requestViewer();
  const userIdTask = viewerTask.then((viewer) => (viewer ? viewer.id : getAuthUserId()));
  const [, { added }, seed] = await Promise.all([
    requireCardPageAccess(id, cardPageAccessWith(() => userIdTask)),
    searchParams,
    viewerTask.then((viewer) => (viewer ? loadViewerSeed(viewer) : null)),
  ]);
  return (
    <SeededViewer seed={seed}>
      <CardDetail id={id} added={isAddedParam(added)} />
    </SeededViewer>
  );
}
