# Product Requirements Document
## Ski Conditions Dashboard & Social Planning App
**Version:** 1.0  
**Status:** Active Development  
**Last Updated:** May 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Target Users & Personas](#3-target-users--personas)
4. [Product Vision & Goals](#4-product-vision--goals)
5. [Success Metrics](#5-success-metrics)
6. [Current Feature Inventory](#6-current-feature-inventory)
7. [Feature Requirements](#7-feature-requirements)
8. [Hosting & Deployment Plan](#8-hosting--deployment-plan)
9. [Technical Architecture](#9-technical-architecture)
10. [Data Architecture](#10-data-architecture)
11. [External Dependencies & Integrations](#11-external-dependencies--integrations)
12. [Edge Cases & Error Handling](#12-edge-cases--error-handling)
13. [Non-Functional Requirements](#13-non-functional-requirements)
14. [Roadmap](#14-roadmap)
15. [Open Questions](#15-open-questions)

---

## 1. Executive Summary

The Ski Conditions Dashboard is a web application for Colorado skiers that fuses real-time mountain conditions intelligence with a Partiful-style social planning layer. On any given morning, a user can see ranked powder scores across all 12 major Colorado resorts, check drive risk on I-70 and the mountain highways, plan a multi-day trip with friends, RSVP to crew trips, and announce their "today" plan so the whole squad knows where to find them.

The application's key differentiator is that **it is simultaneously the best conditions tool and the social coordination layer** — two things that today exist in entirely separate apps (OpenSnow for conditions, group texts for coordination). Combining them into a single, beautifully designed dark-mode experience creates a habit loop: open the app every ski morning to check powder scores, then coordinate with your crew without ever leaving.

---

## 2. Problem Statement

### The Planning Problem
Coordinating a ski day with friends today looks like:
- A group text started 3+ days out asking "who's in for Saturday?"
- A separate check of OpenSnow, OnTheSnow, or the resort app for conditions
- Another check of COtrip or Google Maps for I-70 conditions
- Back to the group text to align on resort, carpool, and meeting time
- Day-of chaos when plans change

This is fragmented across 4–6 apps and takes 20–30 minutes of back-and-forth just to answer "should we ski, and if so, where?"

### The Conditions Problem
Existing conditions apps (OpenSnow, OnTheSnow) are data-heavy but:
- Don't synthesize across resorts into a single ranked decision
- Don't integrate drive risk into the "go/no-go" calculation
- Don't show who in your friend group is planning to be at each mountain
- Are not social — they're information portals, not coordination tools

### The Opportunity
Build the app that sits on every Colorado skier's home screen — the single place you open on a powder morning to answer: **"Where should I ski, and who's coming with me?"**

---

## 3. Target Users & Personas

### Primary: The Enthusiast — "Weekend Warrior"
- Age 25–45, Front Range (Denver/Boulder) resident
- Skis 15–40 days per season, Epic or Ikon pass holder
- Has a regular crew of 4–10 ski friends they coordinate with by text
- Checks conditions every Thursday/Friday before weekend ski decisions
- Pain point: choosing the right mountain for given conditions, getting everyone on the same page quickly

### Secondary: The Planner — "Trip Organizer"
- Plans 1–3 multi-day ski trips per season (mountain town stays)
- Coordinates lodging, carpools, ski days across a larger group (8–20 people)
- Currently uses group chats, Doodle, and Google Sheets to manage
- Pain point: no single tool for planning a ski trip end-to-end with a group

### Tertiary: The Casual — "Occasional Skier"
- Skis 3–8 days per season, often invited by friends rather than self-initiating
- Needs very low friction to see "is it worth going?" and RSVP to an existing trip
- Pain point: doesn't know how to read conditions data — needs a simple score

### Out of Scope (v1)
- Professional ski instructors, patrol, or resort staff
- Non-Colorado resorts (Utah, Tahoe, etc.) — future expansion
- Lift ticket purchasing or resort booking integrations

---

## 4. Product Vision & Goals

### Vision
The morning ritual app for Colorado skiers. Open it, see where the powder is, see who's going, tap to join — all in under 60 seconds.

### Goals (v1)
1. **Decision clarity** — A skier should be able to pick the best resort for today's conditions in under 30 seconds, without any domain expertise
2. **Effortless coordination** — Creating a ski trip and inviting friends should take under 60 seconds
3. **Social momentum** — Seeing friends' plans and RSVPs should create pull to join them
4. **Daily habit** — The app should be worth opening every ski-season morning, not just before a big trip

### Design Principles
- **Dark, electric, alive** — The UI should feel like the mountain at dawn, not a weather website
- **Social proof over raw data** — "3 friends going to Breck" is more compelling than 12" base
- **Fail gracefully** — When a data source goes down, show partial data with clear indication rather than breaking the whole dashboard
- **Mobile first, desktop great** — Most morning decisions happen on a phone in bed

---

## 5. Success Metrics

| Metric | Target (90 days post-launch) |
|---|---|
| Weekly Active Users | 200+ |
| D7 Retention | > 35% |
| Trips Created per Active User | > 1 |
| Average RSVPs per Trip | > 2 |
| Session length on dashboard | > 90 seconds |
| Data freshness (% resorts with live data) | > 90% on any given morning |
| Backend error rate | < 2% of API calls |

---

## 6. Current Feature Inventory

### Built and Functional

**Dashboard (Phase 1)**
- Powder Score algorithm blending NWS forecast snow (24h/48h), resort-reported snow (24h/48h), temp, wind, terrain open %, base depth, and COtrip drive risk penalty
- Normalized scoring (35–95 range) with tiers: Elite / Very Good / Good / Okay / Low
- 12 Colorado resorts: Vail, Beaver Creek, Breckenridge, Keystone, Crested Butte, Telluride (Epic); Winter Park, Copper Mountain, Arapahoe Basin, Steamboat, Eldora, Aspen Snowmass (Ikon)
- Resort cards: hero photo, logo, all snow/terrain/weather metrics, drive risk, directions link
- Crown leaderboard: Best Overall, Best Epic, Best Ikon
- Pass filter (All / Epic / Ikon), resort search, sort (Powder Score / Name / Temp / Snow 24h / Travel Risk)
- Map tab (Leaflet, resort markers with powder score overlay)
- Auto-refresh every 10 minutes

**Backend Proxy (Phase 1)**
- Node.js/Express server on port 8787 with in-memory 5-minute cache
- NWS weather: current conditions, hourly forecast, daily forecast, snowfall grid data
- OnTheSnow scraper (Cheerio): 24h/48h snow, base depth, summit depth, lifts open, runs open
- COtrip scraper: I-70 and mountain highway road alerts → drive risk scoring (Low/Moderate/High/Severe)

**Auth & Profiles (Phase 2)**
- Supabase auth: email/password signup, login, password reset with recovery link
- Auth modal (non-blocking), user menu with avatar/initials
- Profile: full name, username, bio, avatar URL, home resort, ski passes

**Social Layer (Phase 2)**
- Daily check-in (Crew tab): post today's ski plan with resort + ETA + note, update status (planning → driving → arrived → done)
- Today's Crew feed: real-time list of who's skiing where today, polling every 15 seconds
- Friends system: search by name/username, send/accept/decline friend requests, friends leaderboard (days on mountain, days together)
- Crew invites: send a targeted invite to a friend for a specific date/resort with departure time, seats available, message
- Email: Resend SMTP for transactional emails

**Trips / Social Planning (Phase 3 — current)**
- TripCard: resort photo hero, per-resort accent color, countdown badge, going/maybe/can't RSVP with glow animation and spring-scale pop, stacked avatar row, quick emoji hype bar, expandable comment thread with optimistic updates
- CreateTripModal: two-step — visual resort picker grid → details form (date, title, departure time, meeting spot, notes)
- TripsPage: social hub with "Your Trips", "You're Going", "Friends' Trips" sections; empty state with resort photo collage

---

## 7. Feature Requirements

### 7.1 Dashboard & Conditions

#### Powder Score Algorithm

**Philosophy:** Scores are **absolute** (0–100), not relative. A resort earns its score based on actual conditions — not how it compares to other resorts on a given day. This means a bad conditions day returns low scores across the board, and an elite powder day returns high scores. Scores never inflate just because every other resort is equally bad.

**Closed resorts receive no score** (`null`) and display a "Closed" badge. They are excluded from all rankings.

**Formula (v2 — absolute 0–100 scale):**
```
freshSnow     = (snowPrev24in × 5.0, max 32) + (snowPrev48in × 1.5, max 8)   → max 40 pts
incomingSnow  = (snow24in × 3.5, max 15) + (snow48in × 1.0, max 5)           → max 20 pts
tempScore     = absolute band (see below)                                      → max 20 pts
terrainScore  = (runsOpen/runsTotal × 10) + (liftsOpen/liftsTotal × 5)        → max 15 pts
baseScore     = baseDepth / 14, max 5                                          → max  5 pts
snowHint      = +2 if "snow/powder/flurry/wintry" in forecast text            → max  2 pts
windPenalty   = windMph × 0.75, max 15                                         → up to –15 pts
drivePenalty  = 0 (Low) | 5 (Moderate) | 10 (High) | 10 (Severe, capped)     → up to –10 pts

rawScore = freshSnow + incomingSnow + tempScore + terrainScore +
           baseScore + snowHint − windPenalty − drivePenalty

powderScore = clamp(rawScore, 0, 100)  ← no normalization
```

**Temperature bands (calibrated to real skiing feel):**

| Temperature | Score | Label |
|---|---|---|
| 20–30°F | 20 | Sweet spot — cold dry powder |
| 30–35°F | 17 | Warm, still great |
| 35–40°F | 11 | Warm bluebird, snow softening |
| 40–48°F |  4 | Slushy spring conditions |
| 48°F+   |  0 | Full spring slush |
| 12–20°F | 15 | Chilly, very dry powder |
| 0–12°F  |  8 | Frigid — cold hands, icy |
| < 0°F   |  2 | Freezing — near bottom |

**Tier thresholds (absolute):**

| Score | Tier | Color |
|---|---|---|
| 80–100 | Elite | Teal |
| 65–79 | Very Good | Blue |
| 50–64 | Good | Yellow |
| 35–49 | Okay | Orange |
| 0–34 | Poor | Red |
| — | Closed | Gray |

**Calibration examples:**
- Epic powder day (12" fresh, incoming, 26°F, 100% terrain): ~90+ → Elite
- Solid mid-winter day (3" fresh, 28°F, 80% terrain): ~60–70 → Good/Very Good
- Warm bluebird, no snow (38°F, 100% terrain): ~25–35 → Poor
- Late-season end-of-day slush (45°F, partial terrain): ~15–20 → Poor
- Closed resort: no score displayed

**Requirements:**
- F-REQ-001: Powder Score must be recalculated every time live data is refreshed
- F-REQ-002: Missing data for any individual component must default to 0 contribution (not break the score)
- F-REQ-003: Tier labels must use the absolute thresholds above — no percentile-based normalization
- F-REQ-004: The score must be displayed alongside a color-coded tier badge on every resort card
- F-REQ-004a: Closed resorts must display no powder score — a "Closed" badge replaces the score tier

#### Resort Cards
- F-REQ-005: Each resort card must display: Powder Score, tier, snow 24h/48h observed, snow next 24h/48h forecast, temperature, wind, lifts open/total, runs open/total, base depth, drive risk, last forecast update timestamp, Google Maps directions link
- F-REQ-006: Resort photo must be shown as card hero background with a dark gradient overlay for text legibility
- F-REQ-007: Drive risk badge (Low/Moderate/High/Severe) must be color-coded: green/yellow/orange/red
- F-REQ-008: If a skier count exists for a resort (from social layer), it must appear on the card
- F-REQ-009: Cards must be responsive and display in a 1-column layout on mobile, auto-fit grid on desktop

#### Data Refresh
- F-REQ-010: Dashboard data must auto-refresh every 10 minutes while the tab is active
- F-REQ-011: A manual "Refresh Live Data" button must be available and respect the loading state
- F-REQ-012: Partial refresh failures (some resorts fail, others succeed) must display the successful resort data with a non-blocking error indicator
- F-REQ-013: The backend cache TTL is 5 minutes — the frontend must not re-request the same resort more than once per 5-minute window in a single session

### 7.2 Trip Planning (Social Hub)

#### Creating a Trip
- F-REQ-014: Any authenticated user can create a trip with: resort (required), date (required, must be today or future), trip name (optional), departure time (optional text), meeting spot (optional text), notes (optional)
- F-REQ-015: The resort picker must be a visual grid of photo cards, not a dropdown
- F-REQ-016: Date input must reject past dates
- F-REQ-017: Duplicate trip detection: if the same host creates a trip for the same resort on the same date, the system should surface a warning (not block outright)

#### RSVPs
- F-REQ-018: Any authenticated user (except the trip host) can RSVP with one of three statuses: going / maybe / cantgo
- F-REQ-019: RSVP selection must be toggleable — clicking the active status again removes the RSVP
- F-REQ-020: RSVP state must update optimistically in the UI, with silent rollback on error
- F-REQ-021: The host cannot RSVP to their own trip
- F-REQ-022: Changing RSVP status (e.g., "going" → "maybe") must upsert, not create a duplicate record
- F-REQ-023: Going count on the card must update immediately on user RSVP (before server round-trip completes)

#### Discoverability
- F-REQ-024: The "Friends' Trips" section must show upcoming trips created by accepted friends, filtered to dates >= today
- F-REQ-025: A trip the user has already RSVP'd to (going/maybe) must appear in "You're Going", not "Friends' Trips"
- F-REQ-026: Past trips (ski_date < today) must not appear in any feed section

#### Comments & Hype
- F-REQ-027: Any authenticated user who can see a trip can post a comment (text or emoji)
- F-REQ-028: Quick emoji hype buttons (🎿 🔥 ❄️ 🏔️ 🤙 💪 🙌) must post a comment in one tap
- F-REQ-029: Optimistic comment posting: the comment must appear immediately, with silent removal on API error
- F-REQ-030: The last 10 comments must be displayed when the comment section is expanded

#### Trip Lifecycle
- F-REQ-031: The host can delete (cancel) their trip. This must cascade-delete all associated RSVPs and comments (handled by Supabase ON DELETE CASCADE)
- F-REQ-032: A "Cancel trip" action must require a confirmation prompt
- F-REQ-033: Past trips must display a "Past Trip" badge and hide the RSVP buttons

### 7.3 Auth & Profiles

#### Authentication
- F-REQ-034: Email/password signup with server-side email validation
- F-REQ-035: Login with email/password
- F-REQ-036: Password reset flow: user requests reset email → clicks link → opens app in recovery mode → sets new password
- F-REQ-037: Recovery mode must block all other app interactions until password is reset (full-screen overlay)
- F-REQ-038: Auth state must persist across browser sessions (Supabase handles this via localStorage)
- F-REQ-039: Auth modal must be dismissible by clicking the backdrop

#### Profiles
- F-REQ-040: Profile fields: full name, username (unique), bio, avatar URL, home resort (select from resort list), ski passes (Epic / Ikon / Both / Neither)
- F-REQ-041: Username must be URL-safe (alphanumeric + underscore), enforced at DB level
- F-REQ-042: Avatar URL field must accept any HTTPS image URL; display initials fallback if URL fails or is absent

### 7.4 Friends System

- F-REQ-043: Search users by full name or username (case-insensitive partial match)
- F-REQ-044: Friend request flow: send → pending → accept/decline. Accepted creates a bidirectional friendship
- F-REQ-045: Incoming friend requests must be surfaced in the Friends tab with accept/decline actions
- F-REQ-046: A user cannot send a friend request to themselves
- F-REQ-047: Duplicate requests: if a request already exists in either direction, return the existing state
- F-REQ-048: The Friends Leaderboard must display: days on mountain (season), days skied together, top resort
- F-REQ-049: The Crew tab's Today's Crew feed must show plans from accepted friends + the current user

### 7.5 Daily Crew Check-In

- F-REQ-050: Authenticated users can post one plan per ski date (upsert behavior)
- F-REQ-051: Plan fields: resort (required), ETA (optional time), note (optional text)
- F-REQ-052: Status must be updatable inline (planning → driving → arrived → done) without re-submitting the full form
- F-REQ-053: Today's Crew feed must show plans for today only (UTC-aware: use mountain time)
- F-REQ-054: Today's Crew feed must show the current user's plan at the top, friends below

---

## 8. Hosting & Deployment Plan

### Architecture Overview

```
┌─────────────────────────────────────────────┐
│               Users (Browser)               │
└──────────────────┬──────────────────────────┘
                   │ HTTPS
    ┌──────────────▼──────────────┐
    │      Vercel (Frontend)       │
    │   React + Vite static build  │
    │   CDN-distributed globally   │
    └──────────────┬──────────────┘
                   │ HTTPS API calls
    ┌──────────────▼──────────────┐
    │    Railway (Backend Proxy)   │
    │    Node.js / Express         │
    │    Scraping + NWS proxy      │
    └──────────────┬──────────────┘
           ┌───────┴───────┐
           │               │
    ┌──────▼──────┐  ┌──────▼──────┐
    │  NWS API    │  │ OnTheSnow   │
    │ (weather)   │  │  (scraping) │
    └─────────────┘  └──────▼──────┘
                            │
                     ┌──────▼──────┐
                     │   COtrip    │
                     │  (scraping) │
                     └─────────────┘

    ┌─────────────────────────────┐
    │   Supabase (Database + Auth) │
    │   PostgreSQL + Auth + RLS    │
    └─────────────────────────────┘
```

### 8.1 Frontend — Vercel

**Why Vercel:** Zero-config Vite/React deployments, GitHub auto-deploy, global CDN, free tier covers this use case, environment variables via dashboard.

**Steps:**
1. Connect GitHub repo to Vercel
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Set root directory: `/` (project root)
5. Add environment variables (see §8.4)
6. Assign custom domain (e.g., `skiapp.yourdomain.com`)

**Auto-deploy:** Every push to `main` triggers a new production deploy. PRs get preview URLs.

### 8.2 Backend Proxy — Railway

**Why Railway:** Node.js hosting with zero Docker overhead, $5/month starter plan, persistent (no sleep on inactivity), straightforward env var management.

**Steps:**
1. Create a Railway project, connect GitHub repo
2. Set root directory to `/server`
3. Set start command: `node index.js`
4. Railway auto-detects Node and sets `NODE_ENV=production`
5. Expose the service on a Railway-provided subdomain (e.g., `ski-proxy.railway.app`)
6. Add environment variables (see §8.4)

**Alternative: Render.com**
- Free tier available but sleeps after 15 minutes of inactivity — not suitable for a morning-use app where the server must be warm
- Paid tier ($7/mo) is persistent and equivalent to Railway

**Alternative: Fly.io**
- More control (Docker), global regions, persistent machines
- Higher setup complexity — use only if Railway limits are hit

**Required code change before deploying:**
The frontend currently hardcodes `http://localhost:8787` for all API calls. This must be changed to an environment variable:

In `src/App.jsx`, replace all `http://localhost:8787` instances with a configurable base URL. Create a `src/lib/api.js` helper:

```js
// src/lib/api.js
export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8787"
```

Then update all fetch calls in `App.jsx`:
```js
// Before
fetch(`http://localhost:8787/api/nws/point?lat=${lat}&lon=${lon}`)

// After
fetch(`${API_BASE}/api/nws/point?lat=${lat}&lon=${lon}`)
```

**CORS configuration:** The backend currently allows all origins (`app.use(cors())`). Before going live, restrict it to the production frontend domain:

```js
// server/index.js
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:5173"]
app.use(cors({ origin: ALLOWED_ORIGINS }))
```

### 8.3 Database — Supabase

Supabase is already cloud-hosted. For production:

1. **Use the production project** (not the development project) or promote the dev project to production
2. **Enable Row Level Security (RLS)** on all tables (critical — see §10.3)
3. **Set up the ski_trips, trip_rsvps, trip_comments tables** using the SQL in `src/lib/socialApi.js`
4. **Configure Auth settings:**
   - Set the Site URL to the Vercel production URL
   - Add the Vercel preview URL pattern to allowed redirect URLs: `https://*.vercel.app/**`
   - Set the password reset redirect URL to the production domain
5. **Email templates:** Customize the Supabase auth email templates (password reset, confirmation) with your branding

### 8.4 Environment Variables

**Frontend (Vercel dashboard → Settings → Environment Variables):**

| Variable | Description | Example |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xyz.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key | `eyJ...` |
| `VITE_API_URL` | Backend proxy URL (Railway) | `https://ski-proxy.railway.app` |

**Backend (Railway environment variables):**

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server port (Railway auto-sets this) | `8787` |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins | `https://skiapp.yourdomain.com` |
| `NODE_ENV` | Environment flag | `production` |

**Email (if Resend is wired in):**

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key for transactional email |
| `FROM_EMAIL` | Sender address (e.g., `noreply@yourdomain.com`) |

### 8.5 Custom Domain

1. Purchase a domain (Namecheap, Cloudflare Registrar, Google Domains)
2. In Vercel: Settings → Domains → Add domain
3. Point the domain's DNS A/CNAME record to Vercel's provided values
4. Vercel auto-provisions an SSL certificate via Let's Encrypt
5. Update Supabase Auth → URL Configuration with the new domain

### 8.6 Deployment Checklist

Before going live, verify:

- [ ] `VITE_API_URL` points to the Railway backend (not localhost)
- [ ] Railway backend is live and responding to `/api/nws/snow?lat=39.64&lon=-106.37`
- [ ] CORS on backend is restricted to the production domain
- [ ] Supabase Site URL is set to the production domain
- [ ] Password reset emails redirect to production domain
- [ ] RLS is enabled and policies are set on all tables
- [ ] `ski_trips`, `trip_rsvps`, `trip_comments` tables exist in Supabase
- [ ] Resort photos and logos are accessible from the deployed frontend (Vite copies `public/` to `dist/`)
- [ ] HTTPS is working end-to-end (Supabase auth requires HTTPS)
- [ ] The app loads on mobile (test on iOS Safari and Android Chrome)

---

## 9. Technical Architecture

### Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | React 19 + Vite 7 | JSX, ES modules |
| Frontend styling | Inline styles + CSS-in-JS via `<style>` blocks | No Tailwind, no CSS modules |
| Map | React Leaflet + Leaflet | Resort markers with powder score overlay |
| Auth & DB client | `@supabase/supabase-js` v2 | Client-side only, using anon key + RLS |
| Backend proxy | Node.js + Express 4 | Scraping proxy, no auth |
| HTML scraping | Cheerio | OnTheSnow and COtrip |
| HTTP client (server) | node-fetch 3 | ES module fetch |
| Email | Resend | Transactional email |
| Hosting (frontend) | Vercel | CDN, auto-deploy |
| Hosting (backend) | Railway | Persistent Node.js |
| Database | Supabase (PostgreSQL) | Cloud, with RLS |

### Frontend Structure

```
src/
├── App.jsx                 — Root: state, routing (tab-based), auth modal
├── App2.jsx                — [DEPRECATED] parallel prototype, can be removed
├── main.jsx                — React root mount
├── index.css               — Global reset
├── components/
│   ├── AuthForm.jsx        — Login / signup / password reset form
│   ├── AuthPanel.jsx       — [DEPRECATED] older auth component
│   ├── CreateTripModal.jsx — Two-step trip creation modal
│   ├── FriendsPage.jsx     — Friends hub: search, requests, leaderboard, crew invites
│   ├── PowderMap.jsx       — Leaflet map tab
│   ├── ProfilePage.jsx     — Profile wrapper (renders ProfileSetup)
│   ├── ProfileSetup.jsx    — Profile edit form
│   ├── SkiCheckInForm.jsx  — Daily check-in form (Crew tab, left panel)
│   ├── TodaysCrew.jsx      — Live crew feed (Crew tab, right panel)
│   ├── TripCard.jsx        — Partiful-style trip card
│   └── TripsPage.jsx       — Social hub: trip sections + empty state
└── lib/
    ├── socialApi.js        — All Supabase data functions
    └── supabase.js         — Supabase client init

server/
├── index.js               — Express proxy server (all backend routes)
└── package.json

public/
├── logos/                 — Resort logos (PNG)
└── resorts/               — Resort hero photos (JPG)
```

### Backend API Routes

| Route | Method | Params | Description | Cache TTL |
|---|---|---|---|---|
| `/api/nws/point` | GET | `lat`, `lon` | NWS gridpoint lookup | 5 min |
| `/api/nws/forecast` | GET | `url` | NWS forecast proxy | 5 min |
| `/api/nws/snow` | GET | `lat`, `lon` | Snowfall amount grid data | 5 min |
| `/api/resort-snow` | GET | `resort` | OnTheSnow scraper | 5 min |
| `/api/drive-risk` | GET | `resort` | COtrip road alert scraper | 5 min |
| `/api/cotrip` | GET | — | COtrip general page | 5 min |

The server uses an in-memory `Map` for caching. Cache is reset on server restart and does not scale across multiple instances — acceptable for single-instance Railway deployment.

---

## 10. Data Architecture

### 10.1 Supabase Tables

#### `profiles`
```sql
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  full_name       TEXT,
  first_name      TEXT,
  last_name       TEXT,
  username        TEXT UNIQUE,
  bio             TEXT,
  avatar_url      TEXT,
  favorite_mountain TEXT,
  ski_passes      TEXT  -- 'Epic' | 'Ikon' | 'Both' | 'Neither'
);
```

#### `daily_plans`
```sql
CREATE TABLE daily_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ski_date    DATE NOT NULL,
  resort_key  TEXT NOT NULL,
  eta         TIMESTAMPTZ,
  note        TEXT,
  status      TEXT DEFAULT 'planning',  -- planning | driving | arrived | done | cancelled
  UNIQUE(user_id, ski_date)
);
```

#### `friend_requests`
```sql
CREATE TABLE friend_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  requester_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT DEFAULT 'pending',  -- pending | accepted | declined
  UNIQUE(requester_id, recipient_id)
);
```

#### `crew_invites`
```sql
CREATE TABLE crew_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  inviter_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  resort_key      TEXT NOT NULL,
  ski_date        DATE NOT NULL,
  departure_time  TEXT,
  seats_available INT DEFAULT 0,
  message         TEXT,
  status          TEXT DEFAULT 'pending'  -- pending | accepted | declined
);
```

#### `ski_trips` *(new — must be created)*
```sql
CREATE TABLE ski_trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  host_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  resort_key      TEXT NOT NULL,
  ski_date        DATE NOT NULL,
  title           TEXT,
  description     TEXT,
  meeting_spot    TEXT,
  departure_time  TEXT,
  status          TEXT DEFAULT 'upcoming'  -- upcoming | cancelled
);
```

#### `trip_rsvps` *(new — must be created)*
```sql
CREATE TABLE trip_rsvps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  trip_id     UUID REFERENCES ski_trips(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,  -- going | maybe | cantgo
  UNIQUE(trip_id, user_id)
);
```

#### `trip_comments` *(new — must be created)*
```sql
CREATE TABLE trip_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  trip_id     UUID REFERENCES ski_trips(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (length(content) <= 500)
);
```

### 10.2 Indexes

```sql
-- Improve daily_plans lookups
CREATE INDEX idx_daily_plans_ski_date ON daily_plans(ski_date);
CREATE INDEX idx_daily_plans_user_id ON daily_plans(user_id);

-- Improve friend_requests lookups
CREATE INDEX idx_friend_requests_requester ON friend_requests(requester_id);
CREATE INDEX idx_friend_requests_recipient ON friend_requests(recipient_id);

-- Improve trip feed queries
CREATE INDEX idx_ski_trips_host_id ON ski_trips(host_id);
CREATE INDEX idx_ski_trips_ski_date ON ski_trips(ski_date);
CREATE INDEX idx_trip_rsvps_trip_id ON trip_rsvps(trip_id);
CREATE INDEX idx_trip_rsvps_user_id ON trip_rsvps(user_id);
CREATE INDEX idx_trip_comments_trip_id ON trip_comments(trip_id);
```

### 10.3 Row Level Security (RLS) Policies

Enable RLS on all tables. Suggested policies:

```sql
-- profiles: anyone can read, only owner can write
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are publicly readable" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users manage own profile" ON profiles FOR ALL USING (auth.uid() = id);

-- daily_plans: authenticated users can read all, only owner can write
ALTER TABLE daily_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plans readable by authenticated users" ON daily_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users manage own plans" ON daily_plans FOR ALL USING (auth.uid() = user_id);

-- friend_requests: authenticated users can read relevant ones
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Friend requests readable" ON friend_requests FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);
CREATE POLICY "Users create/update own requests" ON friend_requests FOR ALL
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- ski_trips: authenticated users can read, host can write
ALTER TABLE ski_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trips readable by authenticated users" ON ski_trips FOR SELECT TO authenticated USING (true);
CREATE POLICY "Host manages trip" ON ski_trips FOR ALL USING (auth.uid() = host_id);

-- trip_rsvps: authenticated users can read, user manages own
ALTER TABLE trip_rsvps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "RSVPs readable by authenticated users" ON trip_rsvps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users manage own RSVPs" ON trip_rsvps FOR ALL USING (auth.uid() = user_id);

-- trip_comments: authenticated users can read, user manages own
ALTER TABLE trip_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments readable by authenticated users" ON trip_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users manage own comments" ON trip_comments FOR ALL USING (auth.uid() = user_id);
```

---

## 11. External Dependencies & Integrations

### NWS (National Weather Service) API
- **URL:** `https://api.weather.gov`
- **Auth:** None (public API)
- **Rate limit:** Soft limit ~1,000 requests/hour per IP — the backend cache should keep usage well under this
- **Reliability:** Generally stable but occasionally goes down (503s during high-volume weather events)
- **Failure mode:** Backend returns 500 → frontend shows `—` for all weather fields, powder score computed from available data only
- **Data freshness:** Updated hourly by NWS

### OnTheSnow (Cheerio scraping)
- **URLs:** `https://www.onthesnow.com/colorado/{resort}/skireport`
- **Auth:** None (public page)
- **Rate limit:** Not published — backend caches 5 min per resort, so max 12 requests per 5 min cycle
- **Fragility:** HTML scraping will break if OnTheSnow redesigns their page. This is the highest-risk external dependency
- **Failure mode:** Resort-specific fields (base depth, lifts, runs, observed snow) show `—`
- **Alternative:** OpenSnow API (paid, but structured — strongly recommended for Phase 4)
- **Data freshness:** Resort-reported, typically updated once or twice daily by resort staff

### COtrip (Cheerio scraping)
- **URL:** `https://maps.cotrip.org/list/events`
- **Auth:** None (public page)
- **Rate limit:** Not published — backend caches 5 min per resort
- **Fragility:** Similar scraping fragility to OnTheSnow
- **Failure mode:** Drive risk defaults to `Unknown`, no drive penalty applied to powder score
- **Data freshness:** Real-time road conditions (updated continuously by CDOT)

### Supabase
- **Auth:** Email/password with Supabase Auth. JWT tokens managed client-side
- **Database:** PostgreSQL 15, hosted on Supabase's AWS infrastructure
- **SLA:** 99.9% uptime on Pro plan
- **Free tier limits:** 500MB database, 2GB egress, 50,000 MAUs — adequate for early-stage
- **Failure mode:** App becomes read-only for auth actions; conditions dashboard still works

### Resend (Email)
- **Purpose:** Transactional email (friend request notifications, crew invite notifications)
- **Auth:** `RESEND_API_KEY` environment variable
- **Failure mode:** Notification emails silently fail — in-app state remains correct

---

## 12. Edge Cases & Error Handling

### Data & Conditions

| Edge Case | Current Behavior | Required Behavior |
|---|---|---|
| NWS returns 503 for a resort | Raw score defaults to 0 for weather components | Show `—` for affected fields; do not show a misleading score of 0 |
| OnTheSnow page is unavailable | Resort snow data missing | Show `—` for observed snow, base, lifts, runs; still show NWS data |
| COtrip returns no alerts | Drive risk = Low | Correct — no alerts means safe road |
| COtrip parsing finds no matching keywords | Drive risk = Low | Correct — same behavior |
| Resort lat/lon is inside a canyon (NWS grid miss) | NWS point lookup fails | Graceful 500 from backend → frontend shows partial data |
| All 12 resorts fail to fetch | `live` state is empty | Dashboard shows resort cards with all `—` fields; no crash |
| Backend cache is stale (server restarted during active session) | Next request re-fetches | No action needed — cached key is just missing, fresh fetch occurs |
| Two simultaneous refreshes from the same user | Both requests fire | Cache prevents double-scraping; second request returns cached result |
| NWS returns snowfall in units other than mm | `toInches()` may default to /25.4 | Review unit codes in production; NWS typically uses `wmoUnit:mm` |

### Auth & User Management

| Edge Case | Required Behavior |
|---|---|
| User opens password reset link after it expires (1hr) | Supabase returns error → show "Link expired, request a new one" |
| User opens password reset link in a different browser | Auth state isn't present → Supabase handles session from URL hash |
| User deletes their account | Cascade deletes all user data (profiles, plans, friend_requests, trips, rsvps, comments) via ON DELETE CASCADE |
| User signs up with an email already in use | Supabase returns `User already registered` → surface to UI as "An account with this email already exists" |
| User has no profile row yet (signup race condition) | `getMyProfile()` returns null → show ProfileSetup onboarding flow |
| Session token expires mid-session | Supabase auto-refreshes tokens; if refresh fails, user is silently logged out → next API call returns 401 → surface login prompt |
| Two tabs open, user logs out in one | Auth state change propagates via Supabase's `onAuthStateChange` subscription → both tabs update |

### Trip Planning

| Edge Case | Required Behavior |
|---|---|
| User creates a trip for a past date (edge: date changes at midnight) | Frontend date input sets `min=today`. If midnight passes during a session, submission validation should re-check |
| User RSVPs to a trip that was just deleted | API returns 404/error → silently fail, refresh trips list |
| Two users RSVP simultaneously | `UNIQUE(trip_id, user_id)` + upsert handles this — no duplicate rows |
| Host deletes trip while a user is viewing it | Next RSVP attempt fails → refresh removes the card from view |
| Trip host's account is deleted | `ON DELETE CASCADE` removes trip → appears deleted on next load |
| User has no friends (empty friends list) | "Friends' Trips" section does not appear; empty state is shown |
| Friend creates a trip but unfriends before the trip date | Trip is no longer in friend ID set → disappears from Friends' Trips on next load |
| User comments on a trip after it's past | No restriction — post-trip hype is fine |
| Comment contains only whitespace | Trimmed before insert → empty string → silently block (add client + server validation) |
| Comment is over 500 characters | Database `CHECK` constraint rejects → surface error to user |
| Quick hype emoji fires multiple times rapidly | Each creates a separate comment row — acceptable, shows enthusiasm |

### Social & Friends

| Edge Case | Required Behavior |
|---|---|
| Sending a friend request to a user who already sent you one | `sendFriendRequest` detects the incoming pending request → return `incoming_pending` action → UI should prompt to accept instead |
| Accepting a declined friend request (resent) | Existing row updated to `pending` via "revived" flow, then accepted |
| Searching for a username with special characters | Input is used in `.ilike.%${trimmed}%` → SQL injection risk if trimmed is not sanitized. Supabase parameterizes this, but validate client-side too |
| User searches for their own name | `searchProfiles` excludes the current user via `.neq("id", user.id)` |
| User has > 20 search results | Query is `.limit(20)` — surface a "narrow your search" hint |

### Network & Performance

| Edge Case | Required Behavior |
|---|---|
| User on slow mobile connection (3G) | All data fetches are async with loading states. Dashboard cards render with `—` placeholders while loading |
| Backend takes > 10 seconds to respond | No timeout currently set — add `AbortController` with 10-second timeout to all fetch calls |
| User loses network mid-session | Failed refreshes show the last cached data with a timestamp; a non-blocking error banner appears |
| Server is down (Railway restart) | Backend returns connection refused → frontend shows error banner, retains last known data |
| User hammers "Refresh Live Data" button | Button is disabled while `loading=true` — no duplicate requests possible |
| Very large friend count (500+) | `getAcceptedFriendIds` fetches all at once — for large friend lists, this SELECT could be slow. Add pagination if needed |

---

## 13. Non-Functional Requirements

### Performance
- NFR-001: Dashboard initial load (conditions for all 12 resorts) must complete in under 8 seconds on a standard broadband connection
- NFR-002: RSVP interactions must feel instant — optimistic updates must display within 50ms of click
- NFR-003: Comment posting must appear within 100ms of submit (optimistic)
- NFR-004: Backend API response time for any single route must be under 3 seconds (excluding the first cold-cache fetch)
- NFR-005: The frontend build size must remain under 750KB gzipped

### Reliability
- NFR-006: The dashboard must function in a degraded state (showing partial data) when any single data source is unavailable
- NFR-007: Auth and social features must be fully independent of the conditions backend — Supabase downtime affects social but not the static dashboard
- NFR-008: Backend cache must prevent redundant scraping — no more than one scrape per resort per 5-minute window
- NFR-009: The Railway backend must have a health check endpoint (`GET /health → 200`) for uptime monitoring

### Security
- NFR-010: All Supabase tables must have RLS enabled — no table should be accessible without a valid JWT
- NFR-011: The anon/public Supabase key must never grant write access beyond what RLS policies allow
- NFR-012: CORS on the backend must be restricted to the production domain before going live
- NFR-013: No secret keys (Supabase service role key, Resend API key) may appear in client-side code or be exposed in the browser
- NFR-014: User-supplied content (comments, profile fields) must be stored as-is and rendered safely (React's JSX handles XSS via escaped rendering)
- NFR-015: Password reset tokens expire in 1 hour (Supabase default — do not extend)

### Availability
- NFR-016: Target 99% uptime for the frontend (Vercel SLA)
- NFR-017: Target 99% uptime for the backend (Railway SLA, or Render paid tier)
- NFR-018: Supabase free tier has no formal SLA — upgrade to Pro ($25/mo) before public launch

### Compatibility
- NFR-019: The app must be fully functional on iOS Safari 16+ and Chrome for Android 110+
- NFR-020: The app must be usable on a 375px wide viewport (iPhone SE)
- NFR-021: The app must work in dark mode as a default (currently is dark-only — acceptable)

---

## 14. Roadmap

### Phase 4 — Data & Scoring Improvements
- **OpenSnow API integration:** Replace OnTheSnow scraping with OpenSnow's structured API for more reliable and richer snow data (snowfall totals, snowpack, 7-day forecast)
- **Vibe Score:** A second per-resort score blending social signal (how many users checked in last week, RSVP volume for upcoming trips) with crowd estimate and "morning energy" sentiment from comments. This complements the objective Powder Score with a social/experiential dimension
- **7-day forecast panel:** Show a 7-day snowfall forecast per resort (expandable from the card) for trip planning

### Phase 5 — Social Depth & Powder Alerts
- **In-app notifications:** Push notifications (PWA) or email notifications for: friend RSVPs to your trip, friend creates a trip, trip updated by host, friend accepted your friend request
- **Trip invitations:** Explicit invite-to-trip feature (send a trip invite to specific friends by name, separate from the RSVP discovery flow)
- **Resort-level social proof on dashboard:** "3 friends going this weekend" badge on resort cards — creates pull toward popular mountains
- **Activity feed:** A chronological feed of friend activity (created trip, RSVP'd, checked in) with quick actions inline
- **Photo sharing on trips:** Attach a trip photo or post-trip recap photo to a trip card

#### Powder Alert Subscription Service *(new — high priority)*

**Concept:** Every Wednesday, enrolled users receive a powder forecast briefing for the upcoming weekend across all open Colorado resorts. This creates a weekly habit loop that drives retention even when users aren't actively planning a trip.

**Delivery channels (in rollout order):**
1. **App notification** (PWA push) — zero marginal cost, no phone number required
2. **SMS** (Twilio) — highest open rate, opt-in at signup, requires Twilio setup
3. **Email newsletter** — broadest reach, easiest to build, drives re-engagement

**Content of each Wednesday briefing:**
- Weekend weather outlook (Friday–Sunday forecast)
- Top 3 powder scores with tier labels and projected snowfall
- Single recommended "best bet" resort with a one-line reason
- Quick link to view full dashboard
- "Who's going" social proof if friends have created weekend trips

**Subscription model:**
- Opt-in during signup flow (checkbox: "Send me a weekly powder forecast every Wednesday")
- Manageable from Profile page (toggle on/off)
- Stored as `powder_alerts_enabled` boolean on the `profiles` table

**Rollout plan:**
1. Start with email (Resend) — no external cost beyond Resend's free tier
2. Add SMS (Twilio) once phone auth is enabled
3. Evolve into a curated weekly newsletter with editorial voice ("This week the storm track is setting up for Steamboat…")
4. Brand partnership opportunity: sponsored "featured resort" or "powder sponsor" slot in the newsletter

**Brand evolution path:**
- Newsletter → SkiCrew Weekly Powder Report
- Partner with ski brands (apparel, gear, wax), resort advertisers, and après spots
- Build audience → sellable media property aligned with ski lifestyle brand identity

**Technical requirements:**
- `powder_alerts_enabled` column on `profiles` (boolean, default `false`)
- Wednesday cron job (Railway cron or external scheduler) that:
  1. Queries all profiles with `powder_alerts_enabled = true`
  2. Fetches current powder scores for all open resorts
  3. Composes a briefing (top 3, best bet, weekend outlook)
  4. Sends via Resend (email) and/or Twilio (SMS)
- F-REQ-ALERT-001: Briefings must be sent by 7 AM MT on Wednesdays
- F-REQ-ALERT-002: Users must be able to unsubscribe in one tap (standard unsubscribe link in email, STOP reply for SMS)
- F-REQ-ALERT-003: No briefing should be sent if zero resorts are open (off-season cutoff)

### Phase 6 — Platform Expansion
- **Mobile app (React Native):** Native iOS/Android with push notifications
- **Multi-state resorts:** Utah (Park City, Alta/Snowbird, Deer Valley), Jackson Hole, Tahoe resorts
- **Pass-agnostic resorts:** Resorts not on Epic or Ikon (A-Basin independent days, Monarch, Loveland)
- **Lift ticket integration:** Link to resort ticket purchasing from the resort card
- **Weather alerts:** Push a notification when conditions at a favorited resort cross a "powder threshold" (e.g., 8"+ forecast in 24h)

### Phase 7 — Monetization
- **Freemium:** Free tier allows 3 trips/month, 10 friends; Pro tier ($4.99/mo) is unlimited
- **Resort partnerships:** Featured resort placement, sponsored "conditions report" data
- **OpenSnow API cost:** Pass-through via Pro subscription if OpenSnow API is per-call

---

## 15. Open Questions

| Question | Owner | Priority |
|---|---|---|
| Should the Crew tab (daily check-in) and Trips tab be consolidated into a single "Social" tab? | Product | Medium |
| Should trip visibility be opt-in public (anyone with the link) vs. friends-only? A public trip URL would allow sharing via text for users not yet on the platform | Product | High |
| What is the cutoff date for a "ski season"? Should the dashboard show a "No conditions available" state off-season (April–November)? | Product | Medium |
| Should OnTheSnow scraping be replaced now, or wait until it breaks? OpenSnow API is ~$99/mo for commercial use | Engineering | High |
| Should the backend cache be moved to Redis (persistent, survives restarts) on Railway? This would cost ~$3/mo extra but would improve cold-start performance | Engineering | Low |
| What should happen when a user signs up but no profile row is created (Supabase function trigger vs. client-side upsert on signup)? The current flow creates the profile client-side, which can fail silently | Engineering | High |
| Should `App2.jsx` be deleted? It appears to be a deprecated prototype | Engineering | Low |
| Should the password reset redirect URL be configurable per environment (dev vs. prod)? Currently Supabase has a single redirect URL | Engineering | Medium |

---

*This PRD reflects the application state as of May 2026. Update version and date on each significant change.*
