# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Deployment

- **Frontend:** Vercel (static Vite build, auto-deploy from `main`)
- **Database & Auth:** Supabase
- **Backend (`server/`):** Render — a single Web Service serves the Express API **and** runs the weekly powder-briefing cron job in-process (`server/cron.js`, registered at startup by `server/index.js`). Because the cron schedule lives inside the API process, the service must stay on a persistent (paid) Render plan — the free tier sleeps after 15 minutes idle and would kill the schedule.
- Railway is unused; its config (`railway.json`) is archived at `archive/railway.json.archived` in case the backend ever moves back.

See `PRD.md` §8 for the full hosting/deployment plan and `CLAUDE.md` for a project overview.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
