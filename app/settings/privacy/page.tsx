import Link from "next/link";
import { PrivacyLists } from "@/components/privacy-lists";

export default function PrivacyPage() {
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/privacy" className="font-bold underline">
          Privacy policy
        </Link>
      </p>
      <PrivacyLists />
    </div>
  );
}
