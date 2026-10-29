/**
 * Chrome's beforeinstallprompt, held so a real "Install Slabhold" button can
 * show the native prompt later. The event can fire before the step is on
 * screen, so the shell starts listening on load.
 */
type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

let held: PromptEvent | null = null;
let listening: EventTarget | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function onPrompt(event: Event) {
  event.preventDefault();
  held = event as PromptEvent;
  emit();
}

function onInstalled() {
  held = null;
  emit();
}

export function listenForInstallPrompt(target: EventTarget = window) {
  if (listening === target) return;
  listening?.removeEventListener("beforeinstallprompt", onPrompt);
  listening?.removeEventListener("appinstalled", onInstalled);
  target.addEventListener("beforeinstallprompt", onPrompt);
  target.addEventListener("appinstalled", onInstalled);
  listening = target;
}

export function installPromptReady(): boolean {
  return held !== null;
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows the native prompt. Each event can be used once. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = held;
  if (!event) return "unavailable";
  held = null;
  emit();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    return "dismissed";
  }
}

export function resetInstallPrompt() {
  listening?.removeEventListener("beforeinstallprompt", onPrompt);
  listening?.removeEventListener("appinstalled", onInstalled);
  listening = null;
  held = null;
}
