/**
 * Arabic-script shaping crashes the Open Graph font (Satori).
 * Strip those characters before drawing. Other scripts we ship stay.
 */
const UNSUPPORTED_OG_SCRIPT =
  /[\u0600-\u06FF\u0750-\u077F\u0870-\u089F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

export function stripUnsupportedOgText(value: string): string {
  return value.replace(UNSUPPORTED_OG_SCRIPT, " ").replace(/\s+/g, " ").trim();
}
