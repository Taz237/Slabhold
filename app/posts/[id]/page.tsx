"use client";

import { useParams } from "next/navigation";
import { PostView } from "@/components/post-view";

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const postId = Array.isArray(id) ? id[0] : id;
  return <PostView id={postId} />;
}
