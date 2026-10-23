import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlayerChoices, PlayerHub, PlayerHubError } from "@/components/player-hub";
import { loadPlayerHub } from "@/lib/players/load-hub";
import { normalizeSlug } from "@/lib/players/slug";

type Props = { params: Promise<{ player: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { player } = await params;
  const result = await loadPlayerHub(player);
  if (result.kind === "choices") {
    const slug = normalizeSlug(player);
    return {
      title: `${result.name} · Slabhold`,
      description: `${result.name} plays more than one sport. Pick a sport to see public cards and posts.`,
      alternates: { canonical: slug ? `/p/${slug}` : undefined },
    };
  }
  if (result.kind !== "player") {
    return { title: "Player · Slabhold" };
  }
  const { name, sport, slug } = result.page;
  const description = `Public posts, cards, and recent sold prices for ${name}.`;
  return {
    title: `${name} · ${sport} · Slabhold`,
    description,
    alternates: { canonical: `/p/${slug}` },
    openGraph: {
      title: `${name} · ${sport}`,
      description,
      siteName: "Slabhold",
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} · ${sport}`,
      description,
    },
  };
}

export default async function PlayerPage({ params }: Props) {
  const { player } = await params;
  const result = await loadPlayerHub(player);
  if (result.kind === "missing") notFound();
  if (result.kind === "error") return <PlayerHubError />;
  if (result.kind === "choices") {
    return <PlayerChoices name={result.name} choices={result.choices} />;
  }
  return <PlayerHub page={result.page} />;
}
