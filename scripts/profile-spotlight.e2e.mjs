/**
 * The profile Spotlight carousel at iPhone size (390x844), on made-up cards
 * (scripts/profile-spotlight.fixtures.mjs), never a real user's data.
 * Not part of `npm test`: it needs a running build and the pre-installed Playwright.
 *
 *   npx next build && npx next start -p 3100 &
 *   node scripts/profile-spotlight.e2e.mjs http://localhost:3100 docs/profile-spotlight
 *
 * It takes the screenshots and the video in docs/profile-spotlight/, checks
 * the behaviour (swipes, taps, back, See all, old links, the share sheet) and
 * times a hard fling through 200 cards. Runs on local accounts (no Supabase).
 * Chromium only: the touch points go in over its debugging protocol.
 */
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fixtureCards, fixtureValues } from "./profile-spotlight.fixtures.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = process.argv[3] || null;
const ONLY = process.argv[4] || "all";
const ME = "flipcity";
const OTHER = "waxroom";
if (OUT) mkdirSync(OUT, { recursive: true });

async function open(browser, { scheme = "dark", who = OTHER, count = 15, reduced = false, video = false, scale = 2 } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: scale,
    colorScheme: scheme,
    reducedMotion: reduced ? "reduce" : "no-preference",
    hasTouch: true,
    isMobile: true,
    ...(video && OUT ? { recordVideo: { dir: OUT, size: { width: 390, height: 844 } } } : {}),
  });
  const cards = fixtureCards(count);
  const values = fixtureValues(cards);
  await context.route("**/api/card-values*", (route) => route.fulfill({ json: { values } }));
  await context.route("**/_vercel/**", (route) => route.fulfill({ status: 204, body: "" }));
  const seed = await context.newPage();
  await seed.goto(`${BASE}/`);
  await seed.waitForFunction(() => localStorage.getItem("cardflip.social.v1"));
  await seed.evaluate(
    ({ cards, who, me }) => {
      const db = JSON.parse(localStorage.getItem("cardflip.social.v1"));
      const viewer = db.users.find((user) => user.username === me);
      const owner = db.users.find((user) => user.username === who);
      db.sessionUserId = viewer.id;
      db.collections[owner.id] = cards;
      localStorage.setItem("cardflip.social.v1", JSON.stringify(db));
      // The viewer's own book: their public cards when the profile is their own, else empty.
      const now = new Date().toISOString();
      const book = who === me ? cards.map((card) => ({ ...card, isPublic: true, purchasePrice: null, updatedAt: now })) : [];
      localStorage.setItem("cardflip.cards.v1", JSON.stringify(book));
      localStorage.setItem(`slabhold.setup.${viewer.id}`, "done");
      localStorage.setItem(`slabhold.tour.seen.${viewer.id}`, "1");
      localStorage.setItem(`slabhold.install-step.${viewer.id}`, "later");
      localStorage.setItem(`slabhold.add-to-home.dismissed.${viewer.id}`, "1");
    },
    { cards, who, me: ME },
  );
  await seed.close();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, cards, values, errors };
}

const row = "[data-spot-row]";
const pageWidth = (page) => page.evaluate(() => document.documentElement.scrollWidth);

/** Where the row is: scroll position, the centered slide and whether it is at rest on a snap point. */
function rowState(page) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const first = el.querySelector('[data-slide="0"]');
    const second = el.querySelector('[data-slide="1"]');
    const pitch = second ? second.getBoundingClientRect().left - first.getBoundingClientRect().left : first.offsetWidth;
    const index = Math.round(el.scrollLeft / pitch);
    return {
      left: el.scrollLeft,
      pitch,
      index,
      offCenter: Math.abs(el.scrollLeft - index * pitch),
      label: document.querySelector("[data-spot-label][data-on] p")?.textContent ?? null,
      centered: document.querySelector("[data-center]")?.getAttribute("data-slide") ?? null,
      live: el.querySelectorAll(".spot-live").length,
      slides: el.querySelectorAll(".spot-slide").length,
    };
  }, row);
}

/** Wait until the row stops moving and the centered card is a link again. */
async function settle(page) {
  let last = -1;
  for (let i = 0; i < 80; i += 1) {
    await page.waitForTimeout(120);
    const state = await rowState(page);
    if (state && state.left === last && (state.centered !== null || state.index >= state.slides - 1)) return state;
    last = state ? state.left : -1;
  }
  return rowState(page);
}

async function rowCenter(page) {
  await page.locator(row).scrollIntoViewIfNeeded();
  await page.evaluate((selector) => {
    const box = document.querySelector(selector).getBoundingClientRect();
    window.scrollBy(0, box.top - 260);
  }, row);
  await page.waitForTimeout(250);
  const box = await page.locator(row).boundingBox();
  return { x: 195, y: Math.round(box.y + box.height / 2) };
}

/**
 * A real touch swipe: touch points sent to the browser 8ms apart, each with
 * its own timestamp so the speed is exact. The scroll, the momentum after the
 * finger lifts and the snap are all the browser's own. `fling: false` holds
 * the finger still before lifting.
 */
async function swipe(page, { dx = 0, dy = 0, speed = 800, fling = true, x, y }) {
  const cdp = await page.context().newCDPSession(page);
  let at = Date.now() / 1000;
  const touch = (type, px, py) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: Math.round(px), y: Math.round(py) }],
      timestamp: at,
    });
  const steps = Math.max(3, Math.round((Math.hypot(dx, dy) / speed) * 125));
  await touch("touchStart", x, y);
  for (let step = 1; step <= steps; step += 1) {
    at += 0.008;
    await new Promise((resolve) => setTimeout(resolve, 8));
    await touch("touchMove", x + (dx * step) / steps, y + (dy * step) / steps);
  }
  if (!fling) {
    await new Promise((resolve) => setTimeout(resolve, 220));
    at += 0.22;
    await touch("touchMove", x + dx, y + dy);
  }
  at += 0.001;
  await touch("touchEnd");
  await cdp.detach();
}

/** Samples frame times and long tasks in the page while `work` runs. */
async function timed(page, work) {
  await page.evaluate(() => {
    const sample = { frames: [], long: [], on: true };
    window.__spot = sample;
    let last = performance.now();
    const tick = (now) => {
      sample.frames.push(now - last);
      last = now;
      if (sample.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      sample.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) sample.long.push(Math.round(entry.duration));
      });
      sample.observer.observe({ entryTypes: ["longtask"] });
    } catch {}
  });
  await work();
  return page.evaluate(() => {
    const sample = window.__spot;
    sample.on = false;
    sample.observer?.disconnect();
    const frames = sample.frames.slice(1).sort((a, b) => a - b);
    const at = (q) => Math.round(frames[Math.min(frames.length - 1, Math.floor(frames.length * q))] * 10) / 10;
    return {
      frames: frames.length,
      p50: at(0.5),
      p95: at(0.95),
      p99: at(0.99),
      max: Math.round(frames[frames.length - 1] * 10) / 10,
      over20ms: frames.filter((ms) => ms > 20).length,
      longTasks: sample.long.length,
      longest: sample.long.length ? Math.max(...sample.long) : 0,
    };
  });
}

async function screens(browser) {
  const report = [];
  for (const scheme of ["dark", "light"]) {
    for (const who of [OTHER, ME]) {
      for (const count of [0, 1, 2, 15, 200]) {
        const { context, page, errors } = await open(browser, { scheme, who, count });
        await page.goto(`${BASE}/u/${who}`);
        await page.waitForSelector("h1");
        await page.waitForTimeout(1600);
        const own = who === ME;
        const found = await page.evaluate(() => ({
          carousel: Boolean(document.querySelector("[data-spotlight]")),
          prompt: Boolean(document.querySelector("[data-spotlight-prompt]")),
          skeleton: Boolean(document.querySelector("[data-spotlight-skeleton]")),
          slides: document.querySelectorAll(".spot-slide").length,
          live: document.querySelectorAll(".spot-live").length,
          seeAll: document.querySelector("[data-see-all] a")?.getAttribute("aria-label") ?? null,
          tabs: [...document.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent),
          badges: Boolean(document.querySelector("[data-badge-strip], [data-profile-badges]")),
          shareBox: Boolean(document.querySelector("[data-share-collection]")),
        }));
        assert.equal(await pageWidth(page), 390, `${who} ${count} ${scheme}: the page is 390 wide`);
        assert.deepEqual(found.tabs, ["Posts", "Replies", "Media"]);
        assert.equal(found.shareBox, false, "no share box on the profile");
        assert.equal(found.skeleton, false, "the skeleton is gone once the cards are in");
        if (count === 0) {
          assert.equal(found.carousel, false, "no row with no public cards");
          assert.equal(found.prompt, own, "the prompt is only on your own profile");
        } else {
          assert.equal(found.carousel, true);
          assert.equal(found.slides, count + (count >= 2 ? 1 : 0), "every card is a slide, plus See all from 2");
          assert.equal(found.seeAll, count >= 2 ? `See all ${count} cards` : null);
          // Only cards near the center hold real art, however many there are.
          assert.ok(found.live <= 5, `at most 5 real slides at rest on the first card (${found.live})`);
        }
        assert.deepEqual(errors, [], "no page errors");
        if (OUT) {
          // Centre the row in the shot, as it is once the reader scrolls a little.
          if (count > 0) await rowCenter(page);
          await page.screenshot({ path: join(OUT, `${own ? "own" : "other"}-${count}-390-${scheme}.jpg`), quality: 82 });
        }
        report.push({ scheme, who: own ? "own" : "other", count, ...found });
        await context.close();
      }
    }
  }
  return report;
}

async function mixedAndReduced(browser) {
  // Sideways cards, an old uncropped photo and a card with no photo, side by side.
  for (const scheme of ["dark", "light"]) {
    const { context, page } = await open(browser, { scheme, count: 15 });
    await page.goto(`${BASE}/u/${OTHER}`);
    await page.waitForSelector(row);
    await page.waitForTimeout(1200);
    await rowCenter(page);
    for (const [index, name] of [[1, "landscape"], [2, "uncropped"], [5, "no-photo"]]) {
      await page.evaluate(([selector, at]) => {
        const el = document.querySelector(selector);
        const first = el.querySelector('[data-slide="0"]');
        const second = el.querySelector('[data-slide="1"]');
        el.scrollTo({ left: at * (second.getBoundingClientRect().left - first.getBoundingClientRect().left) });
      }, [row, index]);
      await settle(page);
      await page.waitForTimeout(700);
      if (name === "landscape") {
        const shape = await page.evaluate(() => {
          const slide = document.querySelector("[data-center]");
          const art = slide.querySelector("[data-kind]");
          const slot = slide.getBoundingClientRect();
          const box = art.getBoundingClientRect();
          return { landscape: art.getAttribute("data-shape"), wide: box.width > box.height, inside: box.height <= slot.height + 1 && box.width <= slot.width + 1, slot: slot.height / slot.width };
        });
        assert.equal(shape.landscape, "landscape", "a sideways card is measured as landscape");
        assert.ok(shape.wide && shape.inside, "it is shown whole, inside the portrait slot");
        assert.ok(Math.abs(shape.slot - 1.4) < 0.02, "the slot stays 5:7");
      }
      if (OUT) await page.screenshot({ path: join(OUT, `mixed-${name}-390-${scheme}.jpg`), quality: 82 });
    }
    await context.close();
  }

  const { context, page } = await open(browser, { reduced: true, count: 15 });
  await page.goto(`${BASE}/u/${OTHER}`);
  await page.waitForSelector(row);
  await page.waitForTimeout(1200);
  const { x, y } = await rowCenter(page);
  await swipe(page, { dx: -160, speed: 600, fling: false, x, y });
  const state = await settle(page);
  const plain = await page.evaluate(() => {
    const root = document.querySelector("[data-spotlight]");
    const side = document.querySelector('.spot-live:not([data-center]) .spot-scale');
    return {
      fx: root.classList.contains("spot-fx"),
      sideTransform: getComputedStyle(side).transform,
      sideFilter: getComputedStyle(side.querySelector(".spot-blur")).filter,
      glowAnimation: getComputedStyle(root.querySelector(".spot-glow")).animationName,
    };
  });
  assert.equal(plain.fx, false, "reduced motion: no effect class");
  assert.equal(plain.sideTransform, "none", "reduced motion: side cards are full size");
  assert.equal(plain.sideFilter, "none", "reduced motion: no blur");
  assert.equal(plain.glowAnimation, "none", "reduced motion: the glow holds still");
  assert.ok(state.label, `reduced motion: the centered card still has its label (${JSON.stringify(state)})`);
  if (OUT) await page.screenshot({ path: join(OUT, "reduced-motion-390-dark.jpg"), quality: 82 });
  await context.close();
  return { reducedMotion: plain };
}

async function behaviour(browser) {
  const out = {};
  const { context, page, cards, errors } = await open(browser, { count: 200, video: true });
  await page.goto(`${BASE}/u/${OTHER}`);
  await page.waitForSelector(row);
  await page.waitForTimeout(1800);
  assert.equal(await pageWidth(page), 390, "390 wide before any swipe");
  const { x, y } = await rowCenter(page);
  const start = await rowState(page);
  assert.equal(start.index, 0);
  assert.equal(start.slides, 201);
  // Most valuable first: the fixture's first card has the highest value.
  assert.equal(start.label, cards[0].playerName);
  if (OUT) await page.screenshot({ path: join(OUT, "flow-1-rest-390-dark.jpg"), quality: 82 });

  // A slow drag past the halfway point moves one card and stops dead center.
  await swipe(page, { dx: -150, speed: 300, fling: false, x, y });
  const slow = await settle(page);
  assert.equal(slow.index, 1, `a slow drag moves one card (${slow.index})`);
  assert.ok(slow.offCenter <= 1, "it rests dead center");
  out.slowDrag = { moved: slow.index - start.index };

  // A light flick: a card or two.
  await swipe(page, { dx: -70, speed: 700, fling: true, x, y });
  const light = await settle(page);
  assert.ok(light.index - slow.index >= 1 && light.index - slow.index <= 2, `a light flick moves a little (${light.index - slow.index})`);
  assert.ok(light.offCenter <= 1);
  out.lightFlick = { moved: light.index - slow.index };

  // A hard flick glides further on the browser's own momentum, then rests centered. How far is the
  // browser's call: headless Chromium's snap fling is short (about 3 cards). iOS uses the system's
  // deceleration, which carries a hard flick through many more. Nothing here caps it.
  let hard;
  out.hardFling = await timed(page, async () => {
    await swipe(page, { dx: -340, speed: 9000, fling: true, x: 370, y });
    hard = await settle(page);
  });
  assert.ok(hard.index - light.index >= 3, `a hard flick goes further (${hard.index - light.index} cards)`);
  assert.ok(hard.index - light.index > light.index - slow.index, "harder flick, more cards");
  assert.ok(hard.offCenter <= 1, `and still rests dead center (${JSON.stringify(hard)})`);
  assert.ok(hard.live <= 8, `only cards near the center are real DOM (${hard.live})`);
  out.hardFling.moved = hard.index - light.index;
  assert.equal(await pageWidth(page), 390, "390 wide after the fling");
  if (OUT) await page.screenshot({ path: join(OUT, "flow-2-after-fling-390-dark.jpg"), quality: 82 });

  // A side card comes to the center on a tap. Nothing opens.
  const before = page.url();
  await page.touchscreen.tap(362, y);
  const side = await settle(page);
  assert.equal(side.index, hard.index + 1, "a tap on the right card centers it");
  assert.equal(page.url(), before, "a side tap does not navigate");

  // The centered card opens its page, with the card skeleton at the tap. Back lands on the same card.
  const centeredId = await page.evaluate(() => document.querySelector("[data-center]").getAttribute("data-tile"));
  const pending = await page.evaluate(() => {
    document.querySelector("[data-center] a").click();
    return document.documentElement.dataset.navPending ?? null;
  });
  assert.equal(pending, "card", "the card skeleton shows at the tap");
  await page.waitForURL(`**/u/${OTHER}/cards/${centeredId}`);
  await page.waitForSelector("[data-nav-back]");
  await page.waitForTimeout(700);
  if (OUT) await page.screenshot({ path: join(OUT, "flow-3-card-page-390-dark.jpg"), quality: 82 });
  await page.click("[data-nav-back]");
  await page.waitForURL(`**/u/${OTHER}`);
  await page.waitForSelector(row);
  await page.waitForTimeout(900);
  const back = await settle(page);
  assert.equal(back.index, side.index, `back is on the same card (${back.index} vs ${side.index})`);
  assert.equal(await page.evaluate(() => document.querySelector("[data-center]").getAttribute("data-tile")), centeredId);
  out.backSameCard = true;
  if (OUT) await page.screenshot({ path: join(OUT, "flow-4-back-same-card-390-dark.jpg"), quality: 82 });

  // A mostly vertical drag that starts on the row scrolls the page, not the row.
  const spot = await page.locator(row).boundingBox();
  const startY = await page.evaluate(() => window.scrollY);
  await swipe(page, { dx: 14, dy: -260, speed: 900, fling: false, x: 195, y: Math.round(spot.y + spot.height / 2) });
  await page.waitForTimeout(500);
  const afterY = await page.evaluate(() => window.scrollY);
  const afterVertical = await rowState(page);
  assert.ok(afterY - startY > 150, `the page scrolled (${afterY - startY}px)`);
  assert.equal(afterVertical.index, back.index, "the row did not move");
  assert.equal(await pageWidth(page), 390);
  out.verticalDragScrollsPage = afterY - startY;

  // Keyboard: arrows move one card.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.focus(row);
  await page.keyboard.press("ArrowRight");
  const key = await settle(page);
  assert.equal(key.index, back.index + 1, "ArrowRight moves one card");
  await page.keyboard.press("ArrowLeft");
  assert.equal((await settle(page)).index, back.index, "ArrowLeft moves back");

  // See all, at the very end, opens the full grid.
  await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    el.blur();
    el.scrollTo({ left: el.scrollWidth });
  }, row);
  await page.waitForTimeout(900);
  await rowCenter(page);
  if (OUT) await page.screenshot({ path: join(OUT, "flow-5-see-all-390-dark.jpg"), quality: 82 });
  await page.click("[data-see-all] a");
  await page.waitForURL(`**/u/${OTHER}/cards`);
  await page.waitForSelector("[data-profile-cards] [data-tile]");
  await page.waitForTimeout(900);
  const grid = await page.evaluate(() => ({
    title: document.querySelector("h1")?.textContent,
    tiles: document.querySelectorAll("[data-profile-cards] [data-tile]").length,
    filter: Boolean([...document.querySelectorAll("button[aria-pressed]")].find((button) => button.textContent === "Open to offers")),
    price: document.querySelector("[data-profile-cards] [data-price]")?.textContent ?? null,
    width: document.documentElement.scrollWidth,
  }));
  assert.equal(grid.title, `@${OTHER}'s cards`);
  assert.equal(grid.tiles, 200, "the grid holds every public card");
  assert.equal(grid.filter, true, "the Open to offers filter is there");
  assert.match(grid.price ?? "", /^Est\. \$/);
  assert.equal(grid.width, 390);
  out.grid = grid;
  if (OUT) await page.screenshot({ path: join(OUT, "cards-grid-390-dark.jpg"), quality: 82 });
  // Back from the grid is the profile.
  await page.click('button[aria-label="Back to profile"]');
  await page.waitForURL(`**/u/${OTHER}`);
  await page.waitForSelector(row);
  await page.waitForTimeout(600);

  // Old links to the Cards tab land on the grid, with no profile in between.
  for (const tab of ["cards", "collection"]) {
    await page.goto(`${BASE}/u/${OTHER}?tab=${tab}`);
    await page.waitForURL(`**/u/${OTHER}/cards`);
    await page.waitForSelector("[data-profile-cards] [data-tile]");
  }
  out.oldLinksRedirect = true;

  // The header's Cards count goes to the grid too.
  await page.goto(`${BASE}/u/${OTHER}`);
  await page.waitForSelector(row);
  assert.equal(await page.getAttribute(`a[href="/u/${OTHER}/cards"]`, "href"), `/u/${OTHER}/cards`);
  // Someone else's profile: the share control shares the link. No sheet.
  await page.evaluate(() => {
    navigator.share = () => Promise.resolve();
  });
  await page.click(`button[aria-label^="Share "]`);
  await page.waitForTimeout(400);
  assert.equal(await page.locator("[data-share-profile]").count(), 0, "no sheet on someone else's profile");
  assert.deepEqual(errors, [], "no page errors");
  const video = page.video();
  await context.close();
  if (OUT && video) {
    const path = await video.path();
    renameSync(path, join(OUT, "spotlight-flow-390-dark.webm"));
  }

  // Your own profile: the share control opens the sheet with Share profile and the collection actions.
  const own = await open(browser, { who: ME, count: 15 });
  await own.page.goto(`${BASE}/profile`);
  await own.page.waitForSelector(row);
  await own.page.waitForTimeout(1500);
  await own.page.click(`button[aria-label^="Share "]`);
  await own.page.waitForSelector("[data-share-profile]");
  await own.page.waitForTimeout(700);
  const sheet = await own.page.evaluate(() => {
    const dialog = document.querySelector("[data-share-profile]").closest('[role="dialog"]');
    return { text: dialog.textContent, profileRow: Boolean(dialog.querySelector("[data-share-profile]")) };
  });
  assert.ok(sheet.profileRow, "Share profile is in the sheet");
  for (const words of ["Share profile", "Save for Stories"]) assert.ok(sheet.text.includes(words), words);
  if (OUT) await own.page.screenshot({ path: join(OUT, "own-share-sheet-390-dark.jpg"), quality: 82 });
  // /profile?tab=cards goes to your own grid.
  await own.page.goto(`${BASE}/profile?tab=cards`);
  await own.page.waitForURL(`**/u/${ME}/cards`);
  out.ownShareSheet = true;
  await own.context.close();
  return out;
}

/** Hard flicks through 200 cards, timed. `variant` changes one thing at a time. */
async function perf(variant) {
  const browser = await chromium.launch();
  const { context, page } = await open(browser, { count: 200, scale: 3 });
  if (variant.noTimeline) {
    // Stand in for a WebKit without scroll timelines: the feature test says no, and the
    // stylesheet's two @supports branches swap, so the script-driven engine draws the look.
    await page.addInitScript(() => {
      const real = CSS.supports.bind(CSS);
      CSS.supports = (...query) => (String(query[0]).includes("animation-timeline") ? false : real(...query));
      new MutationObserver(() => {
        for (const style of document.querySelectorAll("style")) {
          if (!style.textContent.includes("@supports (animation-timeline: view())")) continue;
          style.textContent = style.textContent
            .replace("@supports (animation-timeline: view())", "@supports (not-a-property: 1)")
            .replace("@supports not (animation-timeline: view())", "@supports (display: block)");
        }
      }).observe(document, { childList: true, subtree: true });
    });
  }
  await page.goto(`${BASE}/u/${OTHER}`);
  await page.waitForSelector(row);
  await page.waitForTimeout(1500);
  if (variant.noBlur) await page.addStyleTag({ content: ".spot-blur{animation:none!important;filter:none!important}" });
  const engine = await page.evaluate(() => {
    const scale = document.querySelector("[data-center] .spot-scale");
    const scripted = Boolean(document.querySelector("[data-center]").style.getPropertyValue("--spot-a"));
    const timeline = getComputedStyle(scale).animationName === "spot-scale";
    return scripted && !timeline ? "script: one custom property per visible slide" : timeline && !scripted ? "scroll-driven CSS" : "mixed";
  });
  const { y } = await rowCenter(page);
  const cdp = await context.newCDPSession(page);
  if (variant.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: variant.cpu });
  const runs = [];
  for (let run = 0; run < 3; run += 1) {
    const from = (await rowState(page)).index;
    let end;
    // Three seconds of hard flicks back to back: each one lands while the last is still gliding.
    const sample = await timed(page, async () => {
      const until = Date.now() + 3000;
      while (Date.now() < until) {
        await swipe(page, { dx: -340, speed: 9000, fling: true, x: 370, y });
        await page.waitForTimeout(260);
      }
      end = await settle(page);
    });
    runs.push({ ...sample, cards: end.index - from, offCenter: Math.round(end.offCenter * 100) / 100 });
  }
  await browser.close();
  const pick = (key) => runs.map((item) => item[key]);
  return {
    variant: variant.name,
    engine,
    cardsPerRun: pick("cards"),
    p50: pick("p50"),
    p95: pick("p95"),
    p99: pick("p99"),
    max: pick("max"),
    framesOver20ms: pick("over20ms"),
    frames: pick("frames"),
    longTasks: pick("longTasks"),
    longest: pick("longest"),
  };
}

const results = {};
const browser = await chromium.launch();
if (ONLY === "all" || ONLY === "screens") results.screens = await screens(browser);
if (ONLY === "all" || ONLY === "mixed") results.mixed = await mixedAndReduced(browser);
if (ONLY === "all" || ONLY === "flow") results.flow = await behaviour(browser);
await browser.close();
if (ONLY === "all" || ONLY === "perf") {
  results.perf = [];
  for (const variant of [
    { name: "shipped (blur on), 1x CPU", cpu: 1 },
    { name: "shipped (blur on), 4x CPU slowdown", cpu: 4 },
    { name: "blur off, 4x CPU slowdown", cpu: 4, noBlur: true },
    { name: "fallback engine (no scroll timelines), 1x CPU", cpu: 1, noTimeline: true },
    { name: "fallback engine (no scroll timelines), 4x CPU slowdown", cpu: 4, noTimeline: true },
  ]) {
    results.perf.push(await perf(variant));
    console.log(JSON.stringify(results.perf.at(-1)));
  }
}
if (OUT) {
  // The seeding tab records a video too: only the named one is kept.
  for (const file of readdirSync(OUT)) if (file.endsWith(".webm") && file !== "spotlight-flow-390-dark.webm") rmSync(join(OUT, file));
  if (ONLY === "all") writeFileSync(join(OUT, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}
console.log(JSON.stringify({ ...results, screens: results.screens?.length }, null, 2));
console.log("profile spotlight: ok");
