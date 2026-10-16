"use client";

import { useParams } from "next/navigation";
import { PublicCardView } from "@/components/public-card-view";

export default function PublicCardPage() {
  const params = useParams<{ username: string; id: string }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <PublicCardView username={username} id={id} />;
}
