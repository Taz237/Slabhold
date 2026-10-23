import Link from "next/link";
import { PrivacyLists } from "@/components/privacy-lists";
import { leaderboardMinimums } from "@/lib/leaderboard/eligibility";

export default function PrivacyPage() {
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/privacy" className="font-bold underline">
          Privacy policy
        </Link>
      </p>
      <PrivacyLists minimums={leaderboardMinimums()} />
    </div>
  );
}
