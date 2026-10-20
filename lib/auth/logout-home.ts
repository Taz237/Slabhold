let pending = false;

/** Log out should land on /, not the signup gate for the page you left. */
export function markLogoutHome() {
  pending = true;
}

export function logoutHomePending() {
  return pending;
}

export function clearLogoutHome() {
  pending = false;
}
