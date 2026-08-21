import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `.claude` holds git worktrees — separate checkouts of this same repo, each with
  // its own built `dist/`. Without this, `npm run lint` reported 1076 problems instead
  // of the real 88, because it was linting minified bundles from other branches. The
  // 'dist' entry above only matches dist/ at the repo root, not .claude/worktrees/*/dist.
  globalIgnores(['dist', '.claude']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],

      // Bans `someDate.toISOString().slice(0, 10)` and its .substring()/.split("T")
      // variants. toISOString() returns UTC, so slicing it for a "YYYY-MM-DD" key
      // yields TOMORROW's date after ~5pm Mountain — every day, for every user in a
      // negative-offset timezone, which is all of Colorado.
      //
      // This was not a hypothetical: leaderboardApi.js used it to cap "days on
      // mountain" at today, and then fire-and-forget upserted the result, so every
      // evening it wrote tomorrow's trip into ski_sessions as a day already skied.
      // Sprint 34 fixed one site; 19 others survived because nothing stopped them.
      //
      // Use localDateKey() from src/lib/calendarDates.js — it takes an optional Date,
      // so it covers both "now" and an arbitrary date object.
      //
      // A bare toISOString() with no slice is fine and intentionally NOT matched:
      // timestamptz columns (created_at, eta, arrived_at) want a true UTC instant.
      'no-restricted-syntax': ['error', {
        selector: "CallExpression[callee.object.callee.property.name='toISOString'][callee.property.name=/^(slice|substring|split)$/]",
        message: 'toISOString() is UTC and rolls over a day early in Mountain Time. Use localDateKey() from src/lib/calendarDates.js to build a YYYY-MM-DD key.',
      }],
    },
  },
  {
    // Test fixtures construct UTC keys deliberately to prove the local/UTC distinction.
    files: ['**/*.test.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
])
