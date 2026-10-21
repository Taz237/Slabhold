import type { Metadata } from "next";
import { CardForm } from "@/components/card-form";

export const metadata: Metadata = { title: "Add a card · Slabhold" };

export default function NewCardPage() {
  return <CardForm />;
}
