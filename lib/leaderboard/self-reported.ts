const SELF_REPORTED_SOURCES = new Set(["self", "owner", "reported"]);

/** True when a matched sale was entered by the owner rather than a paid marketplace sale. */
export function saleSourceIsSelfReported(source: string | null | undefined): boolean {
  if (!source) return false;
  return SELF_REPORTED_SOURCES.has(source.trim().toLowerCase());
}
