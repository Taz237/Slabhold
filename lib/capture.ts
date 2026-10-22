const SCAN_KEY = "cardflip.scan";
const COMPOSE_KEY = "cardflip.compose";

function storage(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function saveScan(dataUrl: string) {
  try {
    storage()?.setItem(SCAN_KEY, dataUrl);
  } catch {
    // A blocked store must not crash the scan handoff.
  }
}

export function takeScan() {
  try {
    const store = storage();
    if (!store) return null;
    const value = store.getItem(SCAN_KEY);
    if (value) store.removeItem(SCAN_KEY);
    return value;
  } catch {
    return null;
  }
}

export function saveCompose(dataUrl: string) {
  try {
    storage()?.setItem(COMPOSE_KEY, dataUrl);
  } catch {
    // A blocked store must not crash the compose handoff.
  }
}

export function takeCompose() {
  try {
    const store = storage();
    if (!store) return null;
    const value = store.getItem(COMPOSE_KEY);
    if (value) store.removeItem(COMPOSE_KEY);
    return value;
  } catch {
    return null;
  }
}
