import type { Metadata } from "next";
import { CardForm } from "@/components/card-form";

export const metadata: Metadata = { title: "Add a card · Slabhold" };

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export default async function NewCardPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = params.q;
  const initialQuery = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  return <CardForm initialQuery={initialQuery} />;
}
