"use client";

import { useParams } from "next/navigation";
import { CardDetail } from "@/components/card-detail";

export default function CardDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <CardDetail id={id} />;
}
