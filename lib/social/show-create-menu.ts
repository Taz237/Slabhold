/** Timeline and your own profile only. Logged-out visitors and other profiles stay hidden. */
export function showCreateMenu(
  pathname: string,
  user: { username: string } | null,
): boolean {
  if (!user) return false;
  if (pathname === "/" || pathname === "/profile") return true;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "u") return false;
  let routeUsername = parts[1];
  try {
    routeUsername = decodeURIComponent(parts[1]);
  } catch {
    return false;
  }
  return routeUsername.toLowerCase() === user.username.toLowerCase();
}
