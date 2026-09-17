# NIWA / 庭景

A browser garden-building game with 37 placeable objects, four Japanese garden
studies, twelve on-demand hint modules, and a persistent community gallery.

## Online demo

Play the full public build:

https://niwa-garden.vercel.app/

This Vercel deployment includes the garden editor and the persistent shared
gallery. The static GitHub Pages mirror remains available at
https://cychen07.github.io/niwa-garden/, but it cannot publish or load shared
works because GitHub Pages does not run the API.

## Run

Requires Node.js 24.7 or newer.

```sh
npm install
npm run dev
```

The command starts both the Vite frontend (port 4173, or the next free port)
and the community API (port 4174, or another available port). Use the frontend
URL printed by Vite; it proxies `/api` to the correct backend.

For a production build:

```sh
npm run build
npm start
```

`npm start` serves both `dist` and `/api` on `http://localhost:4174`.
`npm run preview` previews static assets only; use `npm start` for the gallery.

## Data

- Local development uses `data/community.sqlite`, including scene data and JPEG
  thumbnails. Restarting the local process preserves published works.
- The Vercel deployment uses a private Vercel Blob store in Hong Kong. Vercel
  Functions access it with short-lived OIDC credentials; no static storage
  token is committed to the repository.
- `NIWA_DB`: override the database path. Use a persistent disk in deployment.
- `PORT` and `HOST`: backend port and bind address. Default host is loopback.
- `COOKIE_SECURE=1`: enable secure-only ownership cookies behind HTTPS.
- Guest signatures are not verified accounts. Ownership is attached to an
  HttpOnly browser cookie; clearing cookies loses the ability to remove/update
  previous guest works. An account/recovery system is not included yet.
- The private active draft and timer live in local browser storage. Starting
  a study challenge preserves the previous draft under `niwa-previous-draft`.
  The history icon swaps back to it. v1/v2 legacy saves remain untouched.
- Only explicit publication uploads a garden. Publishing the same draft again
  updates that work. Deleting from the gallery does not delete the local draft.
- Creation time counts recent foreground editor activity, not viewing studies.
  It is client-measured, not an anti-cheat timer. Older drafts have no recoverable
  history of time spent before this feature.

## Verification

```sh
npm run build
npm run verify:community
npm run verify:vercel-api
npm run verify:ui
npm run verify:rake
npm run verify:expansion
```

`verify:community` starts an isolated production server with a separate test
database under `artifacts/community`. It uses two browser contexts, tests
publication, ownership, restart persistence, studies, hints and mobile layouts.
`verify:vercel-api` exercises the Vercel API contract against an isolated
in-memory store without requiring cloud credentials.
Other browser checks expect a running frontend on port 4173.

Playwright checks use `playwright-core`. Set `CHROME_PATH` to a Chromium
executable if it is not installed in the usual Playwright cache.

## Before Public Launch

The public deployment is an MVP. Before promoting it broadly, add moderation,
automated backups, stronger distributed rate limits, account recovery and
privacy terms. Advertising, competitive scores, social sharing and automated
level completion are deferred. No commercial Sims assets or game content are
bundled.
