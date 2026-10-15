const SCAN_KEY = "cardflip.scan";
const COMPOSE_KEY = "cardflip.compose";

export function saveScan(dataUrl: string) {
  sessionStorage.setItem(SCAN_KEY, dataUrl);
}

export function takeScan() {
  const value = sessionStorage.getItem(SCAN_KEY);
  if (value) sessionStorage.removeItem(SCAN_KEY);
  return value;
}

export function saveCompose(dataUrl: string) {
  sessionStorage.setItem(COMPOSE_KEY, dataUrl);
}

export function takeCompose() {
  const value = sessionStorage.getItem(COMPOSE_KEY);
  if (value) sessionStorage.removeItem(COMPOSE_KEY);
  return value;
}
