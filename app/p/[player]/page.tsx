import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PlayerChoices, PlayerHub } from "@/components/player-hub";
import { loadPlayerHub } from "@/lib/players/load-hub";
import { normalizeSlug } from "@/lib/players/slug";

type Props = { params: Promise<{ player: string }> };

export const dynamic = "force-dynamic";

function canonicalRedirect(raw: string, slug: string) {
  const normalized = normalizeSlug(raw);
  if (normalized && slug && normalized !== slug) permanentRedirect(`/p/${slug}`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { player } = await params;
  const result = await loadPlayerHub(player);
  if (result.kind === "missing" || result.kind === "error") {
    return {
      title: "Player · Slabhold",
      robots: "noindex, nofollow",
    };
  }
  if (result.kind === "choices") {
    const slug = normalizeSlug(player);
    return {
      title: `${result.name} · Slabhold`,
      description: `${result.name} plays more than one sport. Pick a sport to see public cards and posts.`,
      alternates: { canonical: slug ? `/p/${slug}` : undefined },
    };
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
  if (result.kind === "error") {
    throw new Error("Couldn't load this player");
  }
  if (result.kind === "choices") {
    return <PlayerChoices name={result.name} choices={result.choices} />;
  }
  canonicalRedirect(player, result.page.slug);
  return <PlayerHub page={result.page} />;
}
