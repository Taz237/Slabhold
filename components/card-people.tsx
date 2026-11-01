"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CardPeopleView } from "@/components/card-people-view";
import { FollowButton } from "@/components/follow-button";
import { useSocial } from "@/components/social-provider";
import { signupPath } from "@/lib/auth/safe-next";
import type { CardFollowSource, OwnersAndHunters } from "@/lib/cards/people";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";

export function CardPeopleSections({ data }: { data: OwnersAndHunters }) {
  const pathname = usePathname() || "/";
  const { user } = useSocial();
  const signedIn = Boolean(user);
  return (
    <CardPeopleView
      data={data}
      signedIn={signedIn}
      signupHref={signupPath(pathname)}
      renderFollow={
        signedIn
          ? (person, source) => (
              <PersonFollow
                handle={person.handle}
                source={source}
                followed={person.isFollowedByViewer}
              />
            )
          : undefined
      }
    />
  );
}

function PersonFollow({
  handle,
  source,
  followed,
}: {
  handle: string;
  source: CardFollowSource;
  followed: boolean;
}) {
  const { profiles } = useSocial();
  const known = profiles.find((profile) => profile.username === handle)?.id ?? null;
  const [resolved, setResolved] = useState<string | null>(null);
  const userId = known ?? resolved;

  useEffect(() => {
    if (known || followed) return;
    let cancelled = false;
    void loadSupabaseBrowser().then((supabase) => {
      if (!supabase || cancelled) return;
      void supabase
        .from("profiles")
        .select("id")
        .eq("username", handle)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && typeof data?.id === "string") setResolved(data.id);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [followed, handle, known]);

  if (followed || !userId) return null;
  return <FollowButton userId={userId} source={source} />;
}
