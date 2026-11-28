import { userHref } from "@/lib/social/user-href";

/** A person's vouches page. */
export function vouchesPath(username: string): string {
  return `${userHref(username)}/vouches`;
}

/** One vouch on its subject's vouches page: the page scrolls to it. */
export function vouchHref(subjectUsername: string, vouchId: string): string {
  return `${vouchesPath(subjectUsername)}#vouch-${encodeURIComponent(vouchId)}`;
}
