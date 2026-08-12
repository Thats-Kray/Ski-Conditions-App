# CLAUDE.md

Project memory for **PowderDays** — a ski conditions dashboard and social planning app for Colorado skiers.

## Docs map

- `README.md` — quick start
- `PRD.md` — full product/feature requirements, technical architecture, and hosting plan (§8)
- `ROADMAP.md` — active/upcoming build tasks
- `sprints/` — execution-ready, task-by-task implementation plans

## Stack

- **Frontend:** React + Vite (`src/`), hosted on Vercel
- **Backend:** Node.js + Express (`server/index.js`) — scraping/NWS proxy and REST API
- **Database & Auth:** Supabase (PostgreSQL + Auth + RLS)
- **Email:** Resend, for transactional and briefing emails

## Deployment: Render

Render hosts the backend, and one Render service does double duty as **both the API and the cron runner**:

- `server/index.js` boots the Express app (`/api/*` routes — resort conditions, NWS proxy, drive-risk, etc.) as a Render Web Service.
- That same process also calls `registerWeeklyBriefingCron()` from `server/cron.js` at startup, which registers an in-process `node-cron` schedule (Wednesdays 7 AM `America/Denver`) that sends the weekly powder-briefing email via Resend.
- There is no separate cron worker or dedicated Render Cron Job resource — the API service *is* the cron runner for as long as it's running.

Because of that, the service **must run on a persistent (paid) Render plan, not the free tier** — Render's free tier sleeps after 15 minutes of inactivity, which would silently kill the cron schedule along with the API.

Frontend (Vercel) and Supabase are unaffected by this — only the Express backend lives on Render. See `PRD.md` §8.2 for the full setup steps and environment variables.
