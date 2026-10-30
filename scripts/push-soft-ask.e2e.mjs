/**
 * Push soft-ask, end to end, at iPhone size (390x844, DPR 3, isMobile).
 * Not part of `npm test`: it needs a running production build and the
 * pre-installed Playwright.
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<throwaway public key> npx next build
 *   npx next start -p 3100 &
 *   node scripts/push-soft-ask.e2e.mjs http://localhost:3100 [screenshot-dir]
 *
 * Runs on local accounts (no Supabase), with Notification, PushManager and
 * the service worker mocked, and /api/push/* answered by the test. Checks:
 * no soft-ask on first open; it shows after a follow; "Not now" holds it for
 * 7 days; once per session. With a screenshot dir it also saves the soft-ask
 * and Settings → Notifications screens in light and dark.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// The pre-installed Playwright is global, not a project dependency.
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] || "http://localhost:3100";
const SHOTS = process.argv[3] || null;
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** Browser push APIs, faked. `permission` and `standalone` come from the test. */
function mockPush({ permission, standalone, push }) {
  const state = { permission, subscribed: Boolean(localStorage.getItem("e2e.subscribed")) };
  window.__push = state;
  if (standalone) {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query) =>
      query.includes("display-mode: standalone") ? { matches: true, media: query, addEventListener() {}, removeEventListener() {} } : real(query);
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
  }
  if (!push) {
    delete window.PushManager;
    delete window.Notification;
    return;
  }
  class FakeNotification {
    static get permission() {
      return state.permission;
    }
    static requestPermission() {
      state.asked = (state.asked || 0) + 1;
      state.permission = "granted";
      return Promise.resolve("granted");
    }
  }
  window.Notification = FakeNotification;
  window.PushManager = function PushManager() {};
  const subscription = () => ({
    endpoint: "https://fcm.googleapis.com/fcm/send/e2e",
    options: { applicationServerKey: null },
    toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/e2e", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } }),
    unsubscribe: async () => {
      state.subscribed = false;
      localStorage.removeItem("e2e.subscribed");
      return true;
    },
  });
  const registration = {
    pushManager: {
      getSubscription: async () => (state.subscribed ? subscription() : null),
      subscribe: async () => {
        state.subscribed = true;
        localStorage.setItem("e2e.subscribed", "1");
        return subscription();
      },
    },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: async () => registration,
      getRegistration: async () => registration,
      ready: Promise.resolve(registration),
      addEventListener() {},
      removeEventListener() {},
    },
  });
}

async function newContext(browser, { ua = ANDROID_UA, colorScheme = "light", permission = "default", standalone = false, push = true } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: ua,
    colorScheme,
  });
  await context.addInitScript(mockPush, { permission, standalone, push });
  await context.route("**/api/push/subscribe", (route) =>
    route.fulfill({ json: route.request().method() === "GET" ? { available: true } : { ok: true } }),
  );
  await context.route("**/api/push/flush", (route) => route.fulfill({ status: 202, json: { ok: true } }));
  return context;
}

/** Signs in as the seeded local collector "flipcity", with onboarding already done. */
async function signIn(context, { accountCreatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString() } = {}) {
  const page = await context.newPage();
  await page.goto(`${BASE}/`);
  await page.waitForFunction(() => localStorage.getItem("cardflip.social.v1"));
  const userId = await page.evaluate((createdAt) => {
    const db = JSON.parse(localStorage.getItem("cardflip.social.v1"));
    const me = db.users.find((user) => user.username === "flipcity");
    me.createdAt = createdAt;
    db.sessionUserId = me.id;
    localStorage.setItem("cardflip.social.v1", JSON.stringify(db));
    localStorage.setItem(`slabhold.setup.${me.id}`, "done");
    localStorage.setItem(`slabhold.tour.seen.${me.id}`, "1");
    localStorage.setItem(`slabhold.install-step.${me.id}`, "later");
    localStorage.setItem(`slabhold.add-to-home.dismissed.${me.id}`, "1");
    return me.id;
  }, accountCreatedAt);
  await page.close();
  return userId;
}

const ASK = "[data-push-soft-ask]";

/** A fresh tab is a fresh session (sessionStorage). Follows boxbreak, unfollowing first if needed. */
async function followInNewSession(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/u/boxbreak`);
  const following = page.getByRole("button", { name: /^Following$/ }).first();
  const follow = page.getByRole("button", { name: /^Follow$/ }).first();
  await follow.or(following).waitFor({ timeout: 20_000 });
  // The push chunk loads after the first idle moment.
  await page.waitForTimeout(2500);
  if (await following.isVisible()) {
    await following.click();
    await follow.waitFor();
  }
  await follow.click();
  return page;
}

async function expectAsk(page, shown, label) {
  if (shown) {
    await page.locator(ASK).waitFor({ timeout: 6000 });
  } else {
    await page.waitForTimeout(3000);
    assert.equal(await page.locator(ASK).count(), 0, label);
  }
}

async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

async function run() {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  // 1. First open: a follow does not ask.
  const context = await newContext(browser);
  const userId = await signIn(context);
  let page = await followInNewSession(context);
  await expectAsk(page, false, "asked on first open");
  console.log("ok - no soft-ask on first open");
  await page.close();

  // 2. Next session: a follow asks, once the success UI settles.
  page = await followInNewSession(context);
  await expectAsk(page, true, "no soft-ask after a follow");
  const dialog = page.getByRole("dialog", { name: "Turn on notifications" });
  assert.equal(await dialog.isVisible(), true);
  console.log("ok - soft-ask after a follow");

  // 3. Not now: not again this session, nor next session within 7 days.
  await page.getByRole("button", { name: "Not now" }).last().click();
  await page.locator(ASK).waitFor({ state: "detached" });
  const stored = await page.evaluate((id) => JSON.parse(localStorage.getItem(`slabhold.pushAsk.${id}`)), userId);
  assert.equal(stored.dismissals, 1);
  await page.close();
  page = await followInNewSession(context);
  await expectAsk(page, false, "asked again inside the 7-day cooldown");
  console.log("ok - Not now holds it back");
  await page.close();

  // 4. Eight days later it may ask again, and Turn on asks permission from the tap.
  page = await context.newPage();
  await page.goto(`${BASE}/u/boxbreak`);
  await page.evaluate((id) => {
    const key = `slabhold.pushAsk.${id}`;
    const state = JSON.parse(localStorage.getItem(key));
    state.lastAt -= 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem(key, JSON.stringify(state));
  }, userId);
  await page.close();
  page = await followInNewSession(context);
  await expectAsk(page, true, "no soft-ask after the cooldown");
  await page.getByRole("button", { name: "Turn on" }).click();
  await page.getByRole("status").filter({ hasText: "Notifications on" }).waitFor({ timeout: 6000 });
  assert.equal(await page.evaluate(() => window.__push.asked), 1);
  console.log("ok - soft-ask returns after 7 days; Turn on asks permission and subscribes");
  await page.close();
  await context.close();

  if (SHOTS) {
    for (const colorScheme of ["light", "dark"]) {
      // Installed app on iPhone: the push soft-ask.
      let shotContext = await newContext(browser, { ua: IPHONE_SAFARI_UA, colorScheme, standalone: true });
      await signIn(shotContext);
      await followInNewSession(shotContext).then((p) => p.close());
      page = await followInNewSession(shotContext);
      await expectAsk(page, true, "installed soft-ask");
      await shot(page, `soft-ask-installed-${colorScheme}`);
      await shotContext.close();

      // iOS Safari tab: add to Home Screen first.
      shotContext = await newContext(browser, { ua: IPHONE_SAFARI_UA, colorScheme, push: false });
      await signIn(shotContext);
      await followInNewSession(shotContext).then((p) => p.close());
      page = await followInNewSession(shotContext);
      await expectAsk(page, true, "add-to-home card");
      assert.equal(await page.getByRole("dialog", { name: "Get notifications on iPhone" }).isVisible(), true);
      await shot(page, `soft-ask-ios-safari-${colorScheme}`);
      await shotContext.close();

      // Settings: push on, then quiet hours open.
      shotContext = await newContext(browser, { colorScheme, permission: "granted" });
      const id = await signIn(shotContext);
      page = await shotContext.newPage();
      await page.goto(`${BASE}/`);
      await page.evaluate((uid) => {
        localStorage.setItem("e2e.subscribed", "1");
        localStorage.setItem(`slabhold.push.on.${uid}`, "1");
      }, id);
      await page.goto(`${BASE}/settings/notifications`);
      await page.getByRole("switch", { name: /Push notifications/ }).waitFor();
      await shot(page, `settings-on-${colorScheme}`);
      await page.getByRole("switch", { name: /^Quiet hours/ }).click();
      await page.getByText("Your local time").waitFor();
      await page.getByRole("switch", { name: /^Quiet hours/ }).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await shot(page, `settings-quiet-hours-${colorScheme}`);
      await shotContext.close();

      // Settings: permission denied, installed on iPhone.
      shotContext = await newContext(browser, { ua: IPHONE_SAFARI_UA, colorScheme, permission: "denied", standalone: true });
      await signIn(shotContext);
      page = await shotContext.newPage();
      await page.goto(`${BASE}/settings/notifications`);
      await page.getByText("Notifications are blocked").waitFor();
      await shot(page, `settings-denied-${colorScheme}`);
      await shotContext.close();
    }
    console.log(`ok - screenshots in ${SHOTS}`);
  }

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
