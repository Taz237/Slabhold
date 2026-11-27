/**
 * The poll copy on posts.meta.poll, as a Post carries it. Kept tiny: every
 * post read goes through here, on every page.
 */

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 4;

export type PollOption = { id: string; label: string };

/** The poll as it sits on a Post. Its labels never change after posting. */
export type PostPoll = {
  id: string;
  /** ISO time the poll closes. */
  endsAt: string;
  options: PollOption[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** The poll on a posts row's meta, when it is one we can draw. */
export function pollFromMeta(meta: unknown): PostPoll | null {
  if (!isRecord(meta) || !isRecord(meta.poll)) return null;
  const { id, ends_at: endsAt, options } = meta.poll;
  if (typeof id !== "string" || !id) return null;
  if (typeof endsAt !== "string" || !Number.isFinite(Date.parse(endsAt))) return null;
  if (!Array.isArray(options)) return null;
  const clean: PollOption[] = [];
  for (const option of options) {
    if (!isRecord(option)) return null;
    if (typeof option.id !== "string" || !option.id) return null;
    if (typeof option.label !== "string" || !option.label.trim()) return null;
    clean.push({ id: option.id, label: option.label.trim().slice(0, 40) });
  }
  if (clean.length < POLL_MIN_OPTIONS || clean.length > POLL_MAX_OPTIONS) return null;
  return { id, endsAt, options: clean };
}

/** `{ poll }` for a Post, left off when the row has none. */
export function pollField(meta: unknown): { poll: PostPoll } | Record<string, never> {
  const poll = pollFromMeta(meta);
  return poll ? { poll } : {};
}
