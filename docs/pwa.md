# PWA Implementation Guide for Stellar MicroPay

## Overview
This document explains the PWA (Progressive Web App) implementation for Stellar MicroPay, enabling:
- ✅ Installation on mobile home screens (Android & iOS)
- ✅ Offline access to cached pages
- ✅ Install banner on supported browsers
- ✅ Standalone app experience
- ⚠️ Web Push notifications — most pieces are implemented, but the
  end-to-end path has gaps; see
  [Push Notifications — Architecture & Current Status](#push-notifications--architecture--current-status-1478)

## Files Created/Modified

### 1. **frontend/public/manifest.json**
Web App Manifest that defines:
- App name: "Stellar MicroPay"
- Short name: "MicroPay"
- Display mode: standalone (hides browser UI)
- Theme color: #7B3FE4 (Stellar purple)
- Icons: 192x192 and 512x512, each with **separate `purpose: "any"` and `purpose: "maskable"` entries** (#1473). See [Icon purpose: any vs maskable](#icon-purpose-any-vs-maskable-1473).
- App shortcuts, install categories and screenshots (#1476). See
  [App shortcuts & install metadata (#1476)](#app-shortcuts--install-metadata-1476).

### 2. **frontend/public/sw.js**
Service Worker that handles:
- Caching of static assets (home page, dashboard, favicon, manifest, icons, offline page)
- Network-first strategy with cache fallback
- Offline support for previously visited pages, plus a branded
  [`offline.html`](#offline-fallback-page-1474) catch-all for failed navigations (#1474)
- Runtime caching is **excluded for price APIs** (CoinGecko) — see
  [Runtime caching policy](#runtime-caching-policy-1472)
- Cache versioning and cleanup
- Update detection: a waiting worker is activated only via a
  user-confirmed prompt (#1475) — see [Update prompt](#update-prompt-skip-waiting-1475)

### 3. **frontend/pages/_document.tsx**
Custom Next.js document with:
- Manifest link tag
- Theme color meta tag (kept in sync with `theme_color` in the manifest)
- Dedicated 180x180 Apple touch icon (`/apple-touch-icon.png`, #1477)
- iOS-specific meta tags for standalone web-app capability and status bar
  style (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`,
  `apple-mobile-web-app-title`)
- MS Tile color for Windows

### 4. **frontend/pages/_app.tsx** (Modified)
Added:
- Service worker registration on app load
- `InstallBanner` component that:
  - Listens for `beforeinstallprompt` event
  - Shows a beautiful install prompt banner
  - Allows users to install or dismiss
  - Styled with Tailwind CSS to match app theme

### 5. **frontend/public/icon-192.svg** & **icon-512.svg**
SVG icons with:
- Stellar purple gradient background
- White diamond/stellar logo
- Rounded corners for modern app appearance

## Icon Setup (IMPORTANT)

The manifest.json references PNG icons. You have two options:

### Option 1: Convert SVG to PNG (Recommended)
1. Open `icon-192.svg` in any browser
2. Screenshot or use a tool to convert to PNG:
   - **Online**: https://cloudconvert.com/svg-to-png
   - **Mac**: Preview app → Export as PNG
   - **Windows**: Paint or Photos app → Save as PNG
   - **CLI**: `convert icon-192.svg icon-192.png` (requires ImageMagick)

3. Save as:
   - `public/icon-192.png` (192x192 pixels)
   - `public/icon-512.png` (512x512 pixels)

### Option 2: Use Online PWA Icon Generator
1. Visit https://realfavicongenerator.net/ or https://pwacompat.com/
2. Upload one of the SVG files
3. Download generated icons
4. Place in `frontend/public/` directory

### Option 3: Create Custom Icons
Design your own icons and save as:
- `public/icon-192.png`
- `public/icon-512.png`

## Icon Purpose: any vs Maskable (#1473)

The two PNG icons are declared with `"purpose": "any"` (fill the canvas, used
wherever an icon is shown) and two dedicated maskable variants are declared
with `"purpose": "maskable"`:

- `public/maskable-icon-192.png` / `public/maskable-icon-512.png`
  (with matching `public/maskable-icon-*.svg` sources)
- Both manifest entries per size are **separate** — the combined
  `"any maskable"` purpose was removed, because one file cannot be optimized
  for both: a maskable icon needs full-bleed art inside the safe zone while
  an `any` icon fills the canvas (previously installed icons could be cropped
  or letterboxed).

### Maskable safe-zone rules

1. The gradient background extends to the full canvas — launchers may crop it
   to a circle, rounded square or squircle, so there are **no rounded
   corners** in the maskable variants.
2. All logo content stays inside the safe zone: a centered circle with a
   radius of 40% of the icon size (76.8px for 192, 204.8px for 512). The
   diamond's farthest vertices sit at ~30% of the icon size from center, well
   within the zone.

### Verify the maskable icons

Use a masking preview tool (e.g. https://webimageresizer.com/pwa-maskable-icon-generator
or the "Field Trial icons" checker) or compute the safe zone on a grid
overlay: import `maskable-icon-512.png`, preview circle/squircle masks, and
confirm the logo is never cropped. Also re-run the Lighthouse PWA audit — it
should no longer flag combined icon purposes.

## Testing PWA Features

### Local Development
```bash
cd frontend
npm run dev
```

**Note**: Service workers require HTTPS in production, but work on `localhost` for development.

### Test Installation on Android Chrome
1. Deploy to HTTPS URL (e.g., Vercel, Netlify)
2. Open in Chrome on Android
3. Wait for install banner to appear OR
4. Tap menu (⋮) → "Add to Home screen"
5. App installs with splash screen and icon

### Test Installation on iOS Safari
1. Deploy to HTTPS URL
2. Open in Safari on iOS
3. Tap Share button
4. Scroll down → "Add to Home Screen"
5. App adds to home screen

### Test Offline Support
1. Visit the app while online
2. Navigate to home page and dashboard
3. Go offline (Airplane mode or DevTools → Offline)
4. Reload the page
5. Cached version should load

### Chrome DevTools Testing
1. Open DevTools (F12)
2. Go to **Application** tab
3. Check:
   - **Manifest**: View manifest details
   - **Service Workers**: Check registration status
   - **Cache Storage**: View cached assets
4. Use **Lighthouse** tab → Generate PWA report

## Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Install Banner | ✅ | ✅ | ❌ | ✅ |
| Service Worker | ✅ | ✅ | ✅ | ✅ |
| Offline Cache | ✅ | ✅ | ✅ | ✅ |
| Add to Home Screen | ✅ | ✅ | ⚠️ Manual | ✅ |

**Note**: iOS Safari doesn't support `beforeinstallprompt` event, so the install banner won't show. Users must manually add to home screen.

## Service Worker Cache Strategy

The service worker uses a **network-first with cache fallback** strategy:
1. Try to fetch from network
2. If successful, cache the response and return it
3. If network fails, serve from cache
4. For HTML pages, fallback to the branded offline page

This ensures:
- Users always get fresh content when online
- App works offline with last cached version
- Graceful degradation

## Runtime Caching Policy (#1472)

Rule of thumb: **never let the service worker serve stale data that the UI
presents as current.**

### Price APIs — excluded from runtime caching

`api.coingecko.com` was removed from `RUNTIME_CACHE_HOSTS`. Under a
network-first SW cache, a price fetched once and then served from the cache
while offline (or while the API was slow) would be shown on the dashboard and
trade pages as if it were the USD price *right now* — silently misleading
users making USD-denominated decisions (send amounts, balances, sell offers).

Instead, price handling lives entirely in the app layer (`frontend/lib/price.ts`):
- A 60-second in-memory cache (fresh by design, never persisted)
- `null` on failure so the UI renders "price unavailable" instead of a number

Because the SW no longer intercepts these requests, a cached price can never
be presented without an explicit absence of freshness. If an offline-time
"as of <time>" staleness label is ever wanted, it must come from the app
layer where the fetch timestamp is known.

### Horizon — kept in runtime cache, reviewed under the same lens

`horizon-testnet.stellar.org` and `horizon.stellar.org` remain in
`RUNTIME_CACHE_HOSTS` (network-first). Review outcome:
- Account/balance responses are network-first, so they are only ever served
  from cache when the network is unreachable — an explicit offline state, not
  a silent staleness. UI built on Horizon calls already handles unreachable
  network states (error / retry surfaces).
- Unlike prices, a last-known balance is not "wrong" in a misleading way: any
  send/confirm operation requires a live Horizon round-trip, which fails
  loudly offline. Caching therefore only improves dashboard resilience.

If the app ever renders Horizon-derived data as *current market/fund state*
without a live connection check, revisit this section and exclude that
endpoint too.

### Other runtime-cached hosts

Same-origin static assets (`self.location.hostname`, `localhost`,
`127.0.0.1`) remain runtime-cached network-first — they are immutable app
shell content, version-bumped via `CACHE_VERSION` on deploy.

## Push Notifications — Architecture & Current Status (#1478)

The project advertises PWA push notifications, and most of the pieces exist —
but they do not yet form a working end-to-end path. This section states
precisely what is implemented, where, and what is still aspirational.

### Status at a glance

| Piece | Status | Where |
|---|---|---|
| Service worker `push` + `notificationclick` handlers | ✅ Implemented (#1143) | `frontend/public/sw.js` |
| Browser subscribe flow (permission → `PushManager.subscribe()` → POST subscription) | ✅ Implemented | `frontend/pages/dashboard.tsx` → `subscribeToPush()` / "Enable payment notifications" toggle |
| HTTP endpoints `POST /api/push/subscribe`, `/api/push/unsubscribe`, `/api/push/payment-event` | ⚠️ Written but **not mounted** — see [Known gaps](#known-gaps--follow-up-issues) | `backend/src/routes/push.js`, `backend/src/controllers/pushController.js` (required in `backend/src/server.js` but never `app.use`d) |
| Subscription registry + VAPID sender | ✅ Implemented (in-memory only) | `backend/src/services/pushService.js` |
| Payment watcher → push fan-out | ✅ Implemented | `backend/src/services/pushService.js` → `ensureWatcher()` (Horizon SSE) |
| VAPID configuration | ✅ Documented | `ENV.md` → "Web Push Notifications (PWA)", `backend/.env.example`, `frontend/.env.example` |
| Soroban contract events → Web Push | ❌ Not implemented | `backend/src/services/eventStreamService.js` feeds the SSE dashboard feed only |

### What happens today, end to end

1. The user clicks **Enable payment notifications** on the dashboard
   (`frontend/pages/dashboard.tsx` → `subscribeToPush()`):
   `/sw.js` is (re-)registered, `Notification.requestPermission()` runs inside
   the user gesture, and — if `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set —
   `registration.pushManager.subscribe({ userVisibleOnly: true,
   applicationServerKey })` creates a `PushSubscription`.
2. The subscription JSON plus the user's Stellar `publicKey` are POSTed to
   `${NEXT_PUBLIC_API_URL}/api/push/subscribe`. The failure is non-fatal: on a
   fetch error the toggle still succeeds and only in-app (same-session)
   notifications work.
3. `pushService.saveSubscription()` stores the subscription **in memory** and
   starts a Horizon payment stream (`cursor: "now"`) for that account.
4. When a payment arrives (`op.type === "payment" && op.to === publicKey`),
   `notifyAccount()` builds a JSON payload `{ title, body, url: "/dashboard" }`
   and calls `webpush.sendNotification()` for each subscription (pruning
   404/410 "gone" endpoints).
5. On the device, the service worker's `push` handler shows the notification
   (icon `/icon-192.png`); `notificationclick` focuses an open dashboard
   window, or navigates an open client / opens a new window to
   `notification.data.url` (default `/dashboard`).

**Important:** step 2 currently fails in the stock backend: `server.js`
requires `./routes/push` but never mounts it, so `/api/push/*` returns 404 and
real cross-device pushes cannot be delivered until the routes are mounted
(see [Known gaps](#known-gaps--follow-up-issues)). The subscribe toggle is
designed to degrade gracefully, so users see no breakage — just no server
pushes.

### Which events trigger a push

- **Implemented:** incoming Horizon **payment operations** to a subscribed
  account (XLM and credit assets), detected by the per-account Horizon stream
  in `pushService.ensureWatcher()`.
- **Not implemented:** Soroban **contract events** (`tip`, `receipt`,
  `open`, `claim`, …). `backend/src/services/eventStreamService.js` polls
  `getEvents` and normalises them for the SSE dashboard feed
  (`backend/src/routes/events.js`), but nothing forwards them to Web Push.

### How subscriptions are stored

In memory only — `Map<publicKey, PushSubscription[]>` in
`backend/src/services/pushService.js`. Consequences (all currently accepted
trade-offs, tracked as follow-ups):

- A backend restart wipes every subscription; users must re-toggle.
- Multiple backend instances don't share state.
- Subscriptions are keyed by Stellar public key with endpoint-level dedupe;
  the last removal for an account also stops its Horizon watcher.
- `isPushConfigured()` is false without both VAPID keys and the `web-push`
  package, in which case sending is a silent no-op (subscribe still "works").

### Configuration

See `ENV.md` → "Web Push Notifications (PWA)" for the full reference:
backend `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_CONTACT`, frontend
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` (must match the backend public key) and
`NEXT_PUBLIC_API_URL`. Generate a keypair with
`npx web-push generate-vapid-keys`.

### Known gaps → follow-up issues

Each item below is a standalone follow-up issue (file with the quoted
title; the link points at the exact code):

1. **"Mount the /api/push routes in backend/src/server.js"** —
   `backend/src/server.js` requires `./routes/push` but never attaches it, so
   every `/api/push/*` call 404s and no subscription ever reaches
   `pushService` in the stock deployment.
2. **"Persist Web Push subscriptions instead of an in-memory Map"** —
   `backend/src/services/pushService.js` line `const subscriptions = new Map()`;
   restarts silently orphan every device.
3. **"Authenticate /api/push/subscribe"** — any rate-limited caller can
   attach a subscription to any Stellar public key; tie it to the existing
   SEP-10 auth (`backend/src/routes/auth.js`).
4. **"Forward Soroban contract events (tip/receipt) to Web Push"** —
   `eventStreamService` already sees them; fan out via
   `pushService.notifyAccount()`.
5. **"Bound the number of Horizon payment watchers"** — one SSE stream per
   subscribed account is unbounded in a long-lived process.

### Local testing recipe

1. Generate keys: `npx web-push generate-vapid-keys`. Put the public key in
   `frontend/.env.local` as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, and both keys in
   `backend/.env` as `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`.
2. **Until follow-up #1 lands**, mount the routes locally: add
   `app.use("/api/push", pushRoutes);` next to the other mounts in
   `backend/src/server.js` (this one line is the fix).
3. Start both sides: `cd backend && npm run dev` and
   `cd frontend && npm run dev` (localhost counts as a secure context, so no
   HTTPS cert is needed).
4. Open `http://localhost:3000/dashboard` → **Enable payment notifications** →
   allow notifications. The confirmation notification should appear.
5. Fire a synthetic push (substitute your own Stellar public key):

   ```bash
   curl -X POST http://localhost:4000/api/push/payment-event \
     -H "Content-Type: application/json" \
     -d '{"publicKey":"G...","title":"Test push","body":"It works"}'
   ```

   The device receives a real Web Push (not `showNotification()`-from-page).
   (`Test notification` on the dashboard validates only the local
   `showNotification` path, not the network hop.)
6. Real end-to-end: fund a second testnet account with Friendbot and send XLM
   to the subscribed account; the Horizon watcher fires the push.
7. iOS/iPadOS: requires **iOS 16.4+** and the app added to the Home Screen
   (installed PWA); check Settings → Safari → Notifications allows prompts.

## Update Prompt (Skip Waiting) (#1475)

`CACHE_VERSION` names the caches (`stellar-micropay-precache-vX` /
`stellar-micropay-runtime-vX`), but a new worker installs into *waiting* by
default and only takes over once every tab is closed — which could leave
users running a stale app shell (potentially with payment bugs) for days.
The app therefore prompts when an update is waiting:

1. Deploy changes → the browser re-downloads `/sw.js` byte-diff and installs
   the new worker in the *waiting* state (install no longer calls
   `skipWaiting()`).
2. `components/ServiceWorkerUpdateToast.tsx` (mounted once inside
   `ToastProvider` in `_app.tsx`) detects `registration.waiting` while
   `navigator.serviceWorker.controller` exists, and shows a translated toast:
   *"A new version is available" — [Reload]*
3. Accepting posts `{ type: "SKIP_WAITING" }` to the worker; the SW's
   `message` handler calls `self.skipWaiting()`, the worker activates, and
   its `clients.claim()` fires `controllerchange` in the page — the page
   reloads **once** (guarded by a user-accepted flag so a first-install
   activation never reloades).
4. Dismissing (the toast auto-dismisses after 10s) defers the update. The
   component lives in the persistent `_app` tree, so no new prompt fires on
   client-side navigation; the user is re-prompted only after a real reload
   or a new tab.

Strings live in `locales/*.json` under the `pwaUpdate` key (`available`,
`reload`) for en/es/ar (with English fallback elsewhere).

### Manual test recipe

1. Run `cd frontend && npm run dev`, open the app, and let the SW activate.
2. Edit `frontend/public/sw.js` (e.g. bump `CACHE_VERSION` to `"v4"`).
3. Reload the page (browser update check re-runs on navigation/`updatefound`).
4. The update toast appears with a **Reload** button.
5. Click Reload → the page reloads exactly once and DevTools →
   Application → Service Workers shows the new worker **active and
   activated** with no second reload.
6. Repeat 2–3, but dismiss/wait out the toast instead: the update activates
   only when all tabs close, and no toast re-appears while navigating.

## Offline Fallback Page (#1474)

Navigations to routes that were never cached previously surfaced the
browser's default error page — jarring inside an installed PWA.
`frontend/public/offline.html` is now precached and served as the catch-all
fallback when online navigation fails:

- Branded (Stellar purple gradient, diamond logo, dark theme matching
  `manifest.json` colors) and fully self-contained: inline styles, no
  external requests.
- The explanation and retry label are translated via an inline script that
  reads `navigator.language` (English, Spanish, Arabic; English fallback) and
  sets `<html lang/dir>` for RTL.
- **Retry** reloads the failed navigation, and the page auto-reloads when the
  `online` event fires — both only succeed once connectivity returns.

`handleNavigation` fallback order: cached copy of the exact URL →
`offline.html`.

### Manual test recipe

1. Serve the app over HTTPS (or localhost) and visit a few routes online.
2. Visit a route you have **not** opened before.
3. Go offline (DevTools → Network → Offline, or Airplane mode) and open
   another uncached route (e.g. a deep link).
4. The branded offline page renders — not the browser error page.
5. Disable the offline override: the auto-reload (or clicking **Retry**)
   brings back the requested page.
6. Sanity check: with the browser language set to Spanish or Arabic, the
   offline page shows the translated text (Arabic switches the page to RTL).

## Cache Versioning

The cache names are versioned: `stellar-micropay-precache-vX` and
`stellar-micropay-runtime-vX` (`CACHE_VERSION` in `sw.js`).

On activate, any `stellar-micropay-*` cache that is not current is deleted.

To update cached assets after deployments:
1. Change `CACHE_VERSION` in `sw.js` (e.g., to `stellar-micropay-precache-v4`)
2. The new install precaches the current `APP_SHELL_URLS`
3. Old caches will be automatically deleted on next activation
4. Users of open tabs get the update prompt above

## Customization

### Change Theme Color
Edit in three places:
1. `manifest.json` → `theme_color`
2. `_document.tsx` → `<meta name="theme-color">`
3. `_document.tsx` → `<meta name="msapplication-TileColor">`

### Add More Pages to Cache
Edit `sw.js` → `STATIC_ASSETS` array:
```javascript
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/transactions',  // Add this
  '/favicon.svg',
  '/manifest.json',
];
```

### Customize Install Banner
Edit the `InstallBanner` component in `_app.tsx`:
- Change colors, text, positioning
- Modify styling with Tailwind classes
- Add animations or custom behavior

## Troubleshooting

### Install Banner Not Showing
- Must be served over HTTPS (except localhost)
- Manifest must have valid icons (PNG format)
- User must have interacted with the page
- On iOS, banner doesn't show (manual add only)

### Service Worker Not Registering
- Check browser console for errors
- Verify `sw.js` is accessible at `/sw.js`
- Ensure browser supports service workers
- Check if blocked by browser settings

### Offline Not Working
- Visit pages while online first to cache them
- Check Cache Storage in DevTools
- Verify service worker is active
- Clear cache and reload to reset

### Icons Not Showing
- Ensure PNG files exist in `public/` folder
- Check file names match manifest.json
- Verify image dimensions (192x192, 512x512)
- Use PNG format, not SVG

## Deployment Checklist

- [ ] Convert SVG icons to PNG format
- [ ] Test manifest.json is accessible at `/manifest.json`
- [ ] Verify service worker registers at `/sw.js`
- [ ] Test on Android Chrome (install & offline)
- [ ] Test on iOS Safari (add to home screen)
- [ ] Run Lighthouse PWA audit (aim for 100%)
- [ ] Update cache version after major updates

## Resources

- [MDN: Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Next.js PWA Guide](https://nextjs.org/docs/app/building-your-application/optimizing/progressive-web-apps)

## App Shortcuts & Install Metadata (#1476)

`manifest.json` goes beyond the install basics in two low-effort ways for
installed users:

### Shortcuts

Three `shortcuts` entries let long-press (Android launcher) / right-click
(Chrome desktop) on the app icon jump straight to a real exported route:

| Shortcut | Route | 96px icon |
|----------|-------|-----------|
| Send a payment | `/pay` | `/icon-send-96.png` |
| Request a payment | `/request` | `/icon-receive-96.png` |
| Open dashboard | `/dashboard` | `/icon-dashboard-96.png` |

Each shortcut icon is 96x96 PNG (`frontend/public/icon-*-96.png`) and is
pre-cached by the service worker alongside the other app-shell icons, so the
launcher never shows a broken glyph offline.

### Richer install metadata

- `"categories": ["finance", "utilities"]` — store/launcher classification.
- `"screenshots"` — two entries so Chrome's richer install dialog can preview
  the app: a **narrow** (1080x1920, `form_factor: "narrow"`) and a **wide**
  (1920x1080, `form_factor: "wide"`) view, shipped under
  `frontend/public/screenshots/`. Screenshots are **not** precached: the
  install dialog only fetches them while online, and precaching ~40KB of
  marketing images on every first visit buys no offline benefit.

### Verify

Chrome DevTools → **Application** → **Manifest** shows the shortcuts (with
icons) and the screenshots entries; the **Application Status** section reports
"shortcuts" and "screenshots" without warnings.

## Future Enhancements

Consider adding:
- Background sync for offline transactions
- Durable (database-backed) push subscriptions — see [Push Notifications → Known gaps](#known-gaps--follow-up-issues)
- More granular caching strategies
- Share target API
- Periodic background sync
