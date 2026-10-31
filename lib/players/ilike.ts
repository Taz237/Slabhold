import { escapeIlike } from "@/lib/db/escape-ilike";

/** PostgREST `or` filter: one escaped ILIKE per spelling, values double-quoted. */
export function playerIlikeOr(column: string, spellings: readonly string[]): string {
  return spellings
    .map((spelling) => {
      const pattern = `%${escapeIlike(spelling)}%`.replace(/"/g, '""');
      return `${column}.ilike."${pattern}"`;
    })
    .join(",");
}
