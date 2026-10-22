/**
 * What Enter should save from a searchable list.
 * An exact option wins. Otherwise a typed name is kept when custom values are allowed.
 * A partial hit such as "Pink" is not substituted for "Optic Preview-Pink".
 */
export function searchSelectCommit(input: {
  query: string;
  options: readonly string[];
  allowCustom?: boolean;
  isCustomValid?: (value: string) => boolean;
}): string | null {
  const typed = input.query.trim();
  if (!typed) return null;
  const exact = input.options.find((option) => option.toLowerCase() === typed.toLowerCase());
  if (exact) return exact;
  if (!input.allowCustom) return null;
  if (input.isCustomValid && !input.isCustomValid(typed)) return null;
  return typed;
}
