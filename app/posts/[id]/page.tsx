import type { Metadata } from "next";
import { PostView } from "@/components/post-view";
import { previewMetadata } from "@/lib/social/link-preview";
import { loadPostPreview } from "@/lib/social/link-preview-load";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return previewMetadata(await loadPostPreview(id));
}

export default async function PostPage({ params }: Props) {
  const { id } = await params;
  return <PostView id={id} />;
}
