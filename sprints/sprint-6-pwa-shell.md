# Sprint 6 — PWA Shell

**Goal:** Make PowderDays installable as a Progressive Web App (PWA) so it can be added to the home screen on iOS and Android. This improves GPS tracking reliability (less likely to be killed by the OS) and creates a more app-like experience.  
**Estimated effort:** 1 day  
**Depends on:** Nothing. This sprint is completely independent and can run in parallel with Sprints 3, 4, or 5.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**Stack:**
- Frontend: React 19 + Vite, deployed on Vercel
- Build tool: Vite. The build output goes to `dist/`. `index.html` is at the project root (Vite convention).
- Static files: anything in `public/` is served at the root path. `public/` currently contains resort photos at `public/resorts/*.jpg`.

**Why this matters for GPS tracking:**
On iOS, when a web page is open in Safari but not added to the home screen, the browser tab can be suspended when the screen locks — pausing GPS updates. When the app is installed via "Add to Home Screen," it runs in a standalone WebView that's more persistent. This is the primary motivation for Sprint 6.

**What a PWA requires:**
1. A `manifest.json` file linked from `index.html` — tells the browser the app name, icons, colors, and display mode
2. A service worker — a background script the browser registers; required for the install prompt on Android. iOS doesn't use the SW for installation, but it's needed for the "app-like" behavior
3. The correct meta tags in `index.html` for iOS home screen behavior

---

## Tasks

All tasks in this sprint are independent and can be done in parallel, but S6-T1 (manifest) and S6-T2 (service worker) should both be complete before S6-T3 (because the nudge should only appear when the app is actually installable).

---

### S6-T1 — `public/manifest.json` + `index.html` meta tags

**File to create:** `public/manifest.json`

```json
{
  "name": "PowderDays",
  "short_name": "PowderDays",
  "description": "Colorado ski conditions, crew planning, and GPS session tracking",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#04080f",
  "theme_color": "#04080f",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

**Icon files:** The icons (`/icons/icon-192.png` and `/icons/icon-512.png`) don't exist yet. Create placeholder SVG-based PNGs at `public/icons/`. Since this is a code task, generate simple programmatic placeholder icons:

- 192×192 PNG: dark background (`#04080f`), centered snowflake or "PD" text in ice blue (`#38bdf8`)
- 512×512 PNG: same design at larger size

If generating actual PNG files from code is not feasible in this context, create the two files as **copies of an existing resort photo scaled down** (e.g. `public/resorts/breckenridge.jpg`) and note in a comment that real icons need to be designed. The manifest must still reference valid files that exist — a broken icon path prevents PWA installation.

**Simplest viable approach:** Create `public/icons/icon-192.png` and `public/icons/icon-512.png` as SVG files renamed to `.png` (browsers accept this for PWA icons in practice), or use a 1×1 transparent PNG as a stub and add a TODO comment. The critical thing is that the files exist and the manifest references them.

**File to modify:** `index.html` (at the project root, not inside `src/`)

Read `index.html` before modifying. Add the following inside `<head>`, after the existing `<meta charset>` and `<meta name="viewport">` tags:

```html
<!-- PWA manifest -->
<link rel="manifest" href="/manifest.json" />

<!-- iOS home screen behavior -->
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="PowderDays" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />

<!-- Theme color (browser chrome color on Android) -->
<meta name="theme-color" content="#04080f" />
```

**Acceptance criteria:**
- `public/manifest.json` is valid JSON with all required fields
- `public/icons/icon-192.png` and `public/icons/icon-512.png` exist (can be stubs)
- `index.html` has all 6 meta/link tags added inside `<head>`
- No existing content in `index.html` is removed or changed
- Visiting the app in Chrome DevTools → Application → Manifest shows the manifest loading without errors

---

### S6-T2 — `public/sw.js` — Service worker (app shell caching)

**File to create:** `public/sw.js`

A minimal cache-first service worker that:
1. Caches the app's static shell on install (so the app loads fast after being installed)
2. Serves cached assets on fetch, falling back to network
3. Does NOT cache API calls (those need fresh data)

```js
const CACHE_NAME = "powderdays-v1"

// Core shell assets — these are the Vite-built files that make the app work offline
// Note: Vite generates hashed filenames like /assets/index-abc123.js
// We cache the index.html + the manifest; Vite chunks cache themselves on first load
const SHELL_ASSETS = [
  "/",
  "/manifest.json",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  )
  // Take control immediately without waiting for old tabs to close
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  // Delete old caches from previous versions
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)

  // Never cache API calls or Supabase requests
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/api/") ||
    url.hostname !== self.location.hostname
  ) {
    return // let the browser handle it normally
  }

  // For everything else (app shell, static assets), try cache first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        // Cache successful GET responses for static assets
        if (
          event.request.method === "GET" &&
          response.status === 200 &&
          (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/resorts/"))
        ) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
    })
  )
})
```

**Register the service worker in `index.html`:**

Add this script tag at the bottom of `<body>` in `index.html`, before the closing `</body>` tag:

```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js')
        .catch(function(err) { console.warn('SW registration failed:', err) })
    })
  }
</script>
```

**Important:** Do not register the SW inside any React component or the Vite `main.jsx` entry point — it must be in `index.html` so it registers before any React code runs, ensuring the install criteria are met before the app's first interaction.

**Acceptance criteria:**
- `public/sw.js` exists
- Service worker registers successfully in Chrome DevTools → Application → Service Workers
- API calls (`/api/*`, `*.supabase.co`) are never intercepted by the SW
- Static assets (`/assets/`, `/resorts/`, `/icons/`) are cached after first load
- Old caches are cleaned up on activate
- `self.skipWaiting()` and `self.clients.claim()` are called (ensures new SW takes control immediately)

---

### S6-T3 — "Add to Home Screen" nudge in `HomeDashboard.jsx`

**File to modify:** `src/components/HomeDashboard.jsx`

Read the file before editing. Add a subtle one-time nudge that appears when:
1. The user is logged in
2. The app is NOT already in standalone mode (i.e., not already installed)
3. The user hasn't dismissed it before (check `localStorage`)
4. The GPS session has started OR a certain number of visits have passed (to avoid pestering new users)

**Standalone detection:** The standard check is:
```js
const isStandalone = window.matchMedia("(display-mode: standalone)").matches
  || window.navigator.standalone === true  // iOS Safari
```

`src/lib/useMobile.js` already exists — read it to see if `isStandalone` is already exported. If not, add it there:
```js
export function useIsStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  )
}
```

**Dismissal persistence:**
```js
const NUDGE_KEY = "pd_a2hs_dismissed"
const hasDismissed = localStorage.getItem(NUDGE_KEY) === "true"
```

**When to show the nudge:** Show when `currentUser && !isStandalone && !hasDismissed && sessionActive`. The `sessionActive` prop is already being passed to `HomeDashboard` from Sprint 4 — show the nudge only once GPS tracking has started, since that's the moment the user most benefits from installation.

**UI:** A compact, dismissable info bar (not a modal). It should look unobtrusive:

```
┌─────────────────────────────────────────────────────────────┐
│  📲 Add to Home Screen for better GPS tracking     [Dismiss] │
└─────────────────────────────────────────────────────────────┘
```

```jsx
const [showNudge, setShowNudge] = useState(false)
const isStandalone = useIsStandalone()

useEffect(() => {
  if (
    currentUser &&
    !isStandalone &&
    !localStorage.getItem("pd_a2hs_dismissed") &&
    sessionActive
  ) {
    setShowNudge(true)
  }
}, [currentUser, isStandalone, sessionActive])

function dismissNudge() {
  localStorage.setItem("pd_a2hs_dismissed", "true")
  setShowNudge(false)
}
```

```jsx
{showNudge && (
  <div style={{
    background: "rgba(56,189,248,0.08)",
    border: "1px solid rgba(56,189,248,0.2)",
    borderRadius: 14,
    padding: "10px 14px",
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 13,
  }}>
    <span style={{ color: "rgba(255,255,255,0.8)" }}>
      📲 Add to Home Screen for better GPS tracking
    </span>
    <button
      onClick={dismissNudge}
      style={{
        background: "none", border: "none", color: "rgba(255,255,255,0.4)",
        fontSize: 12, cursor: "pointer", fontWeight: 700, flexShrink: 0,
      }}
    >
      Dismiss
    </button>
  </div>
)}
```

**iOS vs Android note:** On iOS, the browser does not expose a programmatic install prompt — users must tap Share → "Add to Home Screen" manually. On Android (Chrome), a `beforeinstallprompt` event fires. For simplicity, this nudge just shows the message on both platforms — it does not attempt to trigger the Android install prompt. That enhancement can come later.

**Acceptance criteria:**
- Nudge only appears when `currentUser && !isStandalone && !dismissed && sessionActive`
- Nudge does not appear if app is already installed (standalone mode)
- "Dismiss" button sets `localStorage` flag and hides the nudge for the session and all future sessions
- Nudge does not appear on desktop (desktop is never `sessionActive` in practice, and `standalone` is always false there — the message would be confusing on desktop; add a guard: `isMobile && showNudge`)
- No visual regression to any other part of `HomeDashboard`

---

## Sprint-Level Acceptance Criteria

- [ ] `public/manifest.json` is valid and loads in Chrome DevTools Application tab
- [ ] `public/icons/icon-192.png` and `public/icons/icon-512.png` exist
- [ ] `index.html` has PWA meta tags + service worker registration script
- [ ] `public/sw.js` registers and intercepts static asset requests
- [ ] API and Supabase requests bypass the service worker
- [ ] "Add to Home Screen" nudge appears during an active GPS session on mobile
- [ ] Nudge is permanently dismissable via `localStorage`
- [ ] Nudge does not appear when app is already installed (standalone mode)

## Out of Scope for This Sprint

- Capacitor / React Native native app wrapper (that's a future Sprint 7, documented separately)
- Android `beforeinstallprompt` programmatic install banner
- Offline mode for the conditions data (API calls intentionally bypass the SW)
- Push notifications via service worker (that's a later ROADMAP task)
- Designing actual app icons — stubs are acceptable for this sprint; real icon design is a product/design task
- Any backend server changes
- Do not modify `App.jsx` beyond what Sprint 4 already changed
