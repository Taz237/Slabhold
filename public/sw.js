/*
 * Slabhold service worker. Push notifications only: there is no fetch
 * handler and nothing is cached, so the site loads exactly as it does
 * without it.
 *
 * Payload (lib/push/payload.ts, v1):
 *   { v, title, body, tag, url, kind, badge, renotify, ts, icon }
 */

const FALLBACK_PATH = "/notifications";
const APP_ICON = "/icons/icon-192.png";
const STATUS_BAR_BADGE = "/icons/badge-96.png";
const NAVIGATE_ACK_MS = 1000;

/** Absolute URL on this origin. Anything else falls back to the notifications page. */
function sameOriginUrl(raw) {
  const fallback = new URL(FALLBACK_PATH, self.location.origin).href;
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return fallback;
  }
  try {
    const url = new URL(raw, self.location.origin);
    return url.origin === self.location.origin ? url.href : fallback;
  } catch {
    return fallback;
  }
}

function pathOf(href) {
  const url = new URL(href);
  return url.pathname + url.search + url.hash;
}

function sameOriginClient(client) {
  try {
    return new URL(client.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

function readPayload(event) {
  if (!event.data) return {};
  try {
    const data = event.data.json();
    return data && typeof data === "object" ? data : {};
  } catch {
    return { body: event.data.text() };
  }
}

/** iOS and macOS Safari revoke a subscription whose pushes show nothing. */
function strictAboutVisiblePushes() {
  const ua = (self.navigator && self.navigator.userAgent) || "";
  return /iPhone|iPad|iPod|Macintosh/.test(ua) && !/Chrome|Chromium|CriOS|Android|Firefox|Edg\//.test(ua);
}

async function setBadge(count) {
  const nav = self.navigator;
  if (typeof count !== "number" || !Number.isFinite(count)) return;
  try {
    if (count > 0 && typeof nav.setAppBadge === "function") await nav.setAppBadge(count);
    else if (count <= 0 && typeof nav.clearAppBadge === "function") await nav.clearAppBadge();
  } catch {
    // Badging is a nice-to-have.
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const data = readPayload(event);
      const href = sameOriginUrl(data.url);
      const path = pathOf(href);
      const tag = typeof data.tag === "string" && data.tag ? data.tag : "slabhold";
      await setBadge(data.badge);

      // Already looking at it (the open chat, say): refresh in place, no banner.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const watching = windows.find(
        (client) =>
          sameOriginClient(client) &&
          client.focused &&
          client.visibilityState === "visible" &&
          new URL(client.url).pathname === new URL(href).pathname,
      );
      if (watching) {
        watching.postMessage({ type: "push:refresh", url: path, kind: data.kind });
        if (!strictAboutVisiblePushes()) return;
      }

      const options = {
        body: typeof data.body === "string" ? data.body : "",
        icon: typeof data.icon === "string" && data.icon ? data.icon : APP_ICON,
        badge: STATUS_BAR_BADGE,
        tag,
        renotify: data.renotify !== false,
        data: { url: path },
        timestamp: typeof data.ts === "number" ? data.ts : Date.now(),
      };
      if (watching) options.silent = true;
      await self.registration.showNotification(
        typeof data.title === "string" && data.title ? data.title : "Slabhold",
        options,
      );
      // Safari needs a visible notification for every push. When the page is
      // already open on it, show it silently and take it down at once.
      if (watching) {
        const shown = await self.registration.getNotifications({ tag });
        for (const notification of shown) notification.close();
      }
    })(),
  );
});

/** Ask an open tab to route client-side. Resolves true once the app answers. */
function askToNavigate(client, path) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), NAVIGATE_ACK_MS);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve(true);
    };
    try {
      client.postMessage({ type: "push:navigate", url: path }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = sameOriginUrl(event.notification.data && event.notification.data.url);
  const path = pathOf(href);
  event.waitUntil(
    (async () => {
      const windows = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).filter(
        sameOriginClient,
      );
      const client = windows.find((item) => item.focused) || windows[0];
      if (!client) {
        await self.clients.openWindow(href);
        return;
      }
      try {
        await client.focus();
      } catch {
        // Some browsers refuse focus without a fresh gesture. Navigation still works.
      }
      if (await askToNavigate(client, path)) return;
      try {
        if (typeof client.navigate === "function" && (await client.navigate(href))) return;
      } catch {
        // An uncontrolled tab can't be navigated from here.
      }
      await self.clients.openWindow(href);
    })(),
  );
});

/*
 * The push service rotated or expired the subscription. Browser support
 * varies: Firefox fires this, Chrome and Safari rarely do (they tend to drop
 * the subscription, and the app re-subscribes on its next open instead).
 * The session cookie authenticates the POST.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const previous = event.oldSubscription;
      const key = previous && previous.options && previous.options.applicationServerKey;
      let next = event.newSubscription;
      if (!next && key) {
        next = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
      if (!next) return;
      const json = next.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, platform: "other" }),
      });
    })(),
  );
});
