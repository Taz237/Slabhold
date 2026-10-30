/**
 * Push notification preview harness. Not shipped: nothing imports it.
 *
 * Builds payloads with the real server builder (lib/push/payload.ts) and
 * draws them as iOS-style lock-screen banners, so reviewers can see the exact
 * title, body and grouping a phone would show. Playwright can't capture a
 * real OS banner; this is a faithful stand-in, labelled as a preview.
 *
 *   npx tsx scripts/push-preview.ts <out-dir>
 *
 * Writes push-preview.html (light and dark side by side) and, when the
 * pre-installed Playwright is available, push-preview-light.png and
 * push-preview-dark.png at 390x844, DPR 3.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { singlePayload, summaryPayload, type PushActor, type PushPayload } from "@/lib/push/payload";

const POST = "6f9a1c3e-1111-4222-8333-944455556666";
const jordan: PushActor = { id: "a1", displayName: "Jordan Hale", username: "jordanhale", avatarUrl: null };
const maya: PushActor = { id: "a2", displayName: "Maya Chen", username: "mayachen", avatarUrl: null };
const now = Date.parse("2026-10-30T21:41:00Z");

const samples: { label: string; payload: PushPayload }[] = [
  {
    label: "A single like",
    payload: singlePayload({
      kind: "like",
      actor: jordan,
      postId: POST,
      text: "Pulled a 2018 Prizm Luka silver out of a hanger. Hands still shaking.",
      showPreviews: true,
      badge: 1,
      ts: now,
    }),
  },
  {
    label: "Five likes in a minute: the quiet summary that replaces it",
    payload: summaryPayload({
      kind: "like",
      lead: jordan,
      names: ["Jordan Hale", "Maya Chen"],
      count: 5,
      postId: POST,
      badge: 5,
      ts: now + 50_000,
    }),
  },
  {
    label: "A direct message",
    payload: singlePayload({
      kind: "dm",
      actor: maya,
      postId: null,
      text: "Still have the Wemby rookie? Happy to do a trade for my Clark auto.",
      showPreviews: true,
      badge: 6,
      ts: now + 90_000,
    }),
  },
];

function escape(text: string) {
  return text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

function banner(payload: PushPayload) {
  const [first, ...rest] = payload.body.split("\n");
  const body = [first, ...rest].map(escape).join("<br>");
  return `
  <div class="banner">
    <div class="app"><img src="data:image/svg+xml;utf8,${encodeURIComponent(LOGO)}" alt=""></div>
    <div class="text">
      <div class="row"><span class="title">${escape(payload.title)}</span><span class="when">now</span></div>
      <div class="body">${body}</div>
    </div>
  </div>
  <pre class="json">${escape(JSON.stringify(payload, null, 2))}</pre>`;
}

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#7C3AED"/><rect x="9" y="3.5" width="14" height="25" rx="2.25" fill="#fff"/><rect x="11.15" y="5.75" width="9.7" height="3.5" rx="0.85" fill="#5B21B6"/><path fill="#5B21B6" d="M16 14.5 17.09 17.55 20.33 17.64 17.76 19.62 18.67 22.73 16 20.9 13.33 22.73 14.24 19.62 11.67 17.64 14.91 17.55Z"/></svg>`;

function page(theme: "light" | "dark") {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Push preview (${theme})</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "SF Pro Text", "Geist", system-ui, sans-serif; min-height: 100vh;
    background: ${theme === "dark" ? "linear-gradient(160deg,#1e1b4b,#09090B 60%)" : "linear-gradient(160deg,#c4b5fd,#f4f4f5 60%)"};
    color: ${theme === "dark" ? "#F4F4F5" : "#18181B"}; padding: 18px 12px 24px; }
  .tag { display: inline-block; font: 600 11px/1 ui-monospace, "Geist Mono", monospace; letter-spacing: .08em; text-transform: uppercase;
    background: #7C3AED; color: #fff; border-radius: 999px; padding: 6px 10px; }
  .clock { text-align: center; font-weight: 700; font-size: 64px; letter-spacing: -2px; margin: 10px 0 0; }
  .date { text-align: center; font-weight: 600; font-size: 17px; opacity: .8; margin-bottom: 18px; }
  h2 { font: 600 11px/1.2 ui-monospace, "Geist Mono", monospace; letter-spacing: .08em; text-transform: uppercase; opacity: .7; margin: 18px 6px 6px; }
  .banner { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 22px;
    background: ${theme === "dark" ? "rgba(40,40,46,.82)" : "rgba(255,255,255,.78)"}; backdrop-filter: blur(20px);
    box-shadow: 0 1px 0 rgba(255,255,255,.08) inset, 0 8px 24px rgba(0,0,0,.18); }
  .app img { width: 38px; height: 38px; border-radius: 9px; display: block; }
  .text { min-width: 0; flex: 1; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .title { font-weight: 600; font-size: 15px; }
  .when { font-size: 13px; opacity: .55; }
  .body { font-size: 15px; line-height: 1.3; margin-top: 1px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
  .json { display: none; }
</style></head><body>
  <span class="tag">Preview, not a real OS banner</span>
  <div class="clock">5:41</div>
  <div class="date">Friday, October 30</div>
  ${samples.map((sample) => `<h2>${escape(sample.label)}</h2>${banner(sample.payload)}`).join("\n")}
</body></html>`;
}

async function main() {
  const out = resolve(process.argv[2] ?? "push-preview");
  mkdirSync(out, { recursive: true });
  for (const theme of ["light", "dark"] as const) writeFileSync(join(out, `push-preview-${theme}.html`), page(theme));
  writeFileSync(join(out, "payloads.json"), JSON.stringify(samples, null, 2));

  type Tab = { goto(url: string): Promise<unknown>; screenshot(options: { path: string }): Promise<unknown> };
  type Context = { newPage(): Promise<Tab>; close(): Promise<void> };
  type Browser = { newContext(options: Record<string, unknown>): Promise<Context>; close(): Promise<void> };
  let chromium: { launch(): Promise<Browser> } | null = null;
  try {
    chromium = createRequire(import.meta.url)("playwright").chromium;
  } catch {
    console.log(`Wrote HTML to ${out}. Playwright not found, so no PNGs.`);
    return;
  }
  const browser = await chromium!.launch();
  for (const theme of ["light", "dark"] as const) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true });
    const tab = await context.newPage();
    await tab.goto(`file://${join(out, `push-preview-${theme}.html`)}`);
    await tab.screenshot({ path: join(out, `push-preview-${theme}.png`) });
    await context.close();
  }
  await browser.close();
  console.log(`Wrote previews to ${out}`);
}

void main();
