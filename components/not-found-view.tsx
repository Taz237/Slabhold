import Link from "next/link";
import { Logo } from "@/components/logo";
import { outlineButton, solidButton } from "@/components/button-styles";
import { NotFoundActions } from "@/components/not-found-actions";

export function NotFoundView() {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center">
        <Logo className="h-12 w-12" />
      </div>
      <h1 className="mt-4 text-17 font-semibold tracking-tight">Page not found</h1>
      <p className="mx-auto mt-1.5 max-w-[18rem] text-sm leading-5 text-zinc-500">
        That link does not go anywhere on Slabhold.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Link href="/" className={solidButton}>
          Home
        </Link>
        <NotFoundActions
          signedIn={
            <Link href="/search" className={`${outlineButton} min-h-11`}>
              Search collectors
            </Link>
          }
        >
          <Link href="/signup" className={`${outlineButton} min-h-11`}>
            Sign up
          </Link>
        </NotFoundActions>
      </div>
    </div>
  );
}
