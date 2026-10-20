/** Treat `\`, `%`, and `_` as literals in a Postgres ILIKE pattern. */
export function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
