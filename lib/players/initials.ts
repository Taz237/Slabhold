/**
 * Join a run of single-letter tokens so "c j stroud" and "cj stroud" are the same name.
 * Returns the same array when nothing was joined.
 */
export function collapseInitials(words: readonly string[]): readonly string[] {
  const out: string[] = [];
  let buf = "";
  let changed = false;
  const flush = () => {
    if (!buf) return;
    if (buf.length > 1) changed = true;
    out.push(buf);
    buf = "";
  };
  for (const word of words) {
    if (word.length === 1) {
      buf += word;
      continue;
    }
    flush();
    out.push(word);
  }
  flush();
  return changed ? out : words;
}
