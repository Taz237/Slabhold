import { NoHeadPreload } from "@/components/landing/no-head-preload";
import { Logo } from "@/components/logo";

/** A small brand line below the panels: the logo and "Built by collectors, for collectors." */
export function FounderNote() {
  return (
    <div className="flex min-h-[92px] items-center gap-3.5 rounded-[1.25rem] border border-white/10 bg-[#121214] px-4 py-3.5" data-founder-note="plain">
      <NoHeadPreload>
        <Logo className="h-12 w-12 shrink-0" />
      </NoHeadPreload>
      <div className="min-w-0">
        <p className="text-[13px] text-zinc-400">Slabhold</p>
        <p className="mt-0.5 text-[15px] leading-5 font-semibold text-zinc-100">Built by collectors, for collectors.</p>
      </div>
    </div>
  );
}
