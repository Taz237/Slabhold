import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { OpenToOffersBadge } from "@/components/open-to-offers";
import { solidButton } from "@/components/button-styles";
import {
  SIGNED_OUT_LIST_LIMIT,
  type CardFollowSource,
  type CardPerson,
  type OwnersAndHunters,
} from "@/lib/cards/people";

const HUNTERS_EMPTY = "No one's hunting this yet";

const sectionClass =
  "rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5";

export function CardPeopleView({
  data,
  signedIn,
  signupHref,
  renderFollow,
}: {
  data: OwnersAndHunters;
  signedIn: boolean;
  signupHref: string;
  renderFollow?: (person: CardPerson, source: CardFollowSource) => ReactNode;
}) {
  const owners = signedIn ? data.owners.people : data.owners.people.slice(0, SIGNED_OUT_LIST_LIMIT);
  const hunters = data.hunters
    ? signedIn
      ? data.hunters.people
      : data.hunters.people.slice(0, SIGNED_OUT_LIST_LIMIT)
    : null;

  return (
    <div className="space-y-4">
      <PeopleSection
        title="Owners"
        count={data.owners.count}
        people={owners}
        empty="No public owners yet"
        source="card_owners"
        renderFollow={signedIn ? renderFollow : undefined}
      />
      {hunters && data.hunters ? (
        <PeopleSection
          title="Hunters"
          count={data.hunters.count}
          people={hunters}
          empty={HUNTERS_EMPTY}
          source="card_hunters"
          renderFollow={signedIn ? renderFollow : undefined}
        />
      ) : null}
      {signedIn ? null : (
        <Link href={signupHref} className={`${solidButton} w-full sm:w-auto`}>
          Join to follow collectors
        </Link>
      )}
    </div>
  );
}

function PeopleSection({
  title,
  count,
  people,
  empty,
  source,
  renderFollow,
}: {
  title: string;
  count: number;
  people: readonly CardPerson[];
  empty: string;
  source: CardFollowSource;
  renderFollow?: (person: CardPerson, source: CardFollowSource) => ReactNode;
}) {
  const onlyViewer = title === "Owners" && count === 1 && people.length === 0;
  return (
    <section className={sectionClass}>
      <h2 className="font-semibold">
        {onlyViewer ? "Only you so far" : `${title} (${count})`}
      </h2>
      {onlyViewer ? null : people.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {people.map((person) => (
            <li
              key={person.handle}
              className="flex shrink-0 items-center gap-2 rounded-full border border-zinc-200 py-1 pl-1 pr-2 dark:border-white/10"
            >
              <Link href={`/u/${encodeURIComponent(person.handle)}`} className="flex min-w-0 items-center gap-2">
                <Avatar
                  name={person.displayName}
                  image={person.avatarUrl}
                  className="h-8 w-8"
                  expandable={false}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="max-w-[7.5rem] truncate text-sm font-semibold">@{person.handle}</span>
                  {person.openToOffers ? <OpenToOffersBadge className="mt-0.5" /> : null}
                </span>
              </Link>
              {renderFollow ? renderFollow(person, source) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
