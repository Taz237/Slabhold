/** A roster or retired-star row. Sport uses the collect chips (Basketball, Football, Baseball, Hockey). */
export type DirectoryPlayer = {
  name: string;
  sport: string;
  team?: string;
};

/** Directory row plus the normalized name computed once when that chunk loads. */
export type IndexedDirectoryPlayer = DirectoryPlayer & {
  norm: string;
  words: readonly string[];
  /** norm with spaces removed, so "c j stroud" and "cj stroud" share a key. */
  compact: string;
  /** Single-letter runs joined, only when that differs from `words` ("c j" → "cj"). */
  joined?: readonly string[];
};
