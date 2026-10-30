/**
 * A tiny bus for the signed-in user's own social actions. The social provider
 * emits on every page; listeners (push delivery and its soft-ask) load later,
 * signed in only, so nothing here pulls their code into the first bundle.
 * Actions before a listener is up wait in a short queue.
 */
export type SocialAction = "follow" | "like" | "reply" | "repost" | "post" | "dm";

type Listener = (action: SocialAction) => void;

const MAX_QUEUED = 10;
let listener: Listener | null = null;
let queued: SocialAction[] = [];

export function emitSocialAction(action: SocialAction): void {
  if (listener) {
    try {
      listener(action);
    } catch {
      // A listener must never break a like or a follow.
    }
    return;
  }
  queued = [...queued, action].slice(-MAX_QUEUED);
}

/** One listener at a time. Hands it anything queued, then returns an unsubscribe. */
export function onSocialAction(next: Listener): () => void {
  listener = next;
  const pending = queued;
  queued = [];
  for (const action of pending) emitSocialAction(action);
  return () => {
    if (listener === next) listener = null;
  };
}
