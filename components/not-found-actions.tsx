"use client";

import { useSocial } from "@/components/social-provider";

/**
 * The 404's second button: `children` (Sign up) for visitors and until auth
 * is known, `signedIn` (Search collectors) once someone is signed in. Both
 * are drawn by the server view, so this chunk, which every app route loads,
 * is only the choice.
 */
export function NotFoundActions({ children, signedIn }: { children: React.ReactNode; signedIn: React.ReactNode }) {
  const { ready, user } = useSocial();
  return ready && user ? signedIn : children;
}
