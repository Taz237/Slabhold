"use client";

import { useParams } from "next/navigation";
import { CardPostsList } from "@/components/card-posts-list";

export default function CardPostsPage() {
  const { id } = useParams<{ id: string }>();
  return <CardPostsList cardId={id} />;
}
