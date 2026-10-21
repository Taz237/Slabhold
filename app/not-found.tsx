import Link from "next/link";
import { EmptyState } from "@/components/status";

export default function NotFound() {
  return (
    <EmptyState title="Page not found" detail="That page isn't on Slabhold.">
      <Link href="/" className="text-sm font-bold">
        Home
      </Link>
    </EmptyState>
  );
}
