export type SearchSectionTitle = "People" | "Posts" | "Cards";

export function visibleSearchSections(counts: {
  people: number;
  posts: number;
  cards: number;
}): SearchSectionTitle[] {
  const sections: SearchSectionTitle[] = [];
  if (counts.people > 0) sections.push("People");
  if (counts.posts > 0) sections.push("Posts");
  if (counts.cards > 0) sections.push("Cards");
  return sections;
}

/** One empty line when a query matches nothing. */
export function searchEmptyTitle(query: string): string {
  return `No results for "${query.trim()}"`;
}
