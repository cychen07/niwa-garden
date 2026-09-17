# Creation, Study And Community

## PRD

1. Expand the catalogue from 17 to 37 placeable kinds. Borrow the browsing
   ergonomics of a life-simulation building catalogue, not its assets or scale.
   Preserve the existing quick palette; add a searchable, categorized catalogue.
2. Ship four original compositions based on karesansui, roji tea gardens,
   pond-stroll gardens and tsuboniwa. These are not replicas of named sites.
   Each has a finished 3D view and three selectable construction modules.
3. Publish player gardens to a real persistent server: title, guest signature,
   active creation time, object count, environment, thumbnail and full scene.
   Others can browse, appreciate and inspect them in 3D. Owners can remove
   their works. No invented player entries, times or popularity.

## UX Flow

- Editor -> catalogue -> category/search -> select item -> editor placement.
- Editor -> examples -> finished garden -> rotate/zoom -> choose hint module
  -> material counts and ordered construction steps -> return to own editor.
- Editor -> publish -> title/signature and public-visibility consent -> success
  -> gallery -> newest/appreciated/mine -> 3D inspection.
- Optional challenge: start a blank garden of the selected example's size.
  Require confirmation, preserve a recovery copy, and record the reference.
  No automatic scoring, fake ranking, ads or social sharing in this iteration.

## Wireframe

Editor retains its full-window 3D workspace and existing tool locations.
Compact top-right secondary navigation: catalogue / examples / gallery / publish.

Study and gallery use a full-window overlay: header, tabs or list, main
unframed scene, and a narrow details column. On mobile, the scene sits above
scrollable details. Icons control rotation/zoom/reset. Hint buttons reveal
one module at a time; no forced tutorial.

## Technical Contract

- React + Three.js remain the frontend. Preview scenes reuse object and terrain
  rendering with editing disabled. Thumbnails depict the actual game scene.
- Node 24.7+ HTTP service with SQLite (`node:sqlite`), no managed service needed.
  SQLite and image blobs persist in `data/community.sqlite`; excluded from git.
- Same-origin `/api` proxy in development. Production server serves `dist`.
  Guest ownership uses a random HttpOnly SameSite cookie; only its hash is stored.
  Guest signatures are not verified real-world identities.
- Bound JSON, images, objects and rake points; validate scene data on the server;
  prepared SQL, owner checks, rate limits, idempotent publish and unique likes.
- Draft and active time persist locally. Foreground, recently active editor time
  counts; previews and idle time do not. Time is client-measured and not a
  competitive anti-cheat score. Imported old drafts have unknown earlier time.
- Only an explicit publish uploads the current garden. Local saves remain local.
  New challenge drafts never silently replace the recoverable previous draft.
- New material categories and hints have stable IDs. Ad gating and level
  objectives can be added later without coupling core hint content to an SDK.
- Small furniture (tea table, cushion, bonsai) rests on wood decks and pavilion
  floors automatically; moving the furniture off the footprint returns it to
  the terrain surface.

## Acceptance

- All 37 kinds resolve to rendered models, including placement and persistence.
- Four complete examples are independently rotatable and zoomable on desktop
  and mobile. Hint content includes exact materials, sizes and ordered steps.
- Preview navigation does not mutate the player's draft or undo history.
- Publishing twice for one draft does not create duplicate gallery entries.
- Two isolated browser sessions share works, not local saves or ownership.
- Image and scene survive backend restart; wrong-owner deletion is rejected.
- Loading, empty, offline, validation and publish-error states are usable.
- Public deployment, managed accounts, moderation, backups, anti-cheat timing
  and advertising are explicitly outside this local iteration.

## Verified

The isolated community suite exercises all four study scenes and twelve hint
modules, actual canvas pixels, camera rotation/zoom, unchanged drafts after
viewing, published thumbnails, idempotent updates, private ownership, like
counts, server restart persistence, malformed submissions, cross-origin
rejection, empty/mine views, simulated outage/retry, and draft recovery.
Two browser contexts model separate players. Screenshots cover desktop,
390px mobile and 320px mobile layouts. Tests do not populate the live database.

Artifacts: `artifacts/community/results.json`, `examples.png`,
`overview-dry.png`, `overview-tea.png`, `overview-pond.png`, `overview-court.png`,
`mobile-gallery.png`, `mobile-work.png`, `mobile-hint.png`.

Run instructions and hosting prerequisites are in `README.md`.
