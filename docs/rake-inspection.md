# Rake Effect Inspection

Date: 2026-09-10

## Verdict

The slow-input defect below has been fixed and verified. Overall visual
acceptance remains pending: wide tight turns still self-intersect and grooves
are too faint at the default camera scale, especially on mobile.

This inspection did not change application code or user saves. It added
`scripts/inspect-rake.mjs` and used isolated Playwright browser contexts with
flat, empty sand/grass fixtures. The script gathers evidence rather than
returning a pass/fail exit code.

## Slow-Drag Fix

The follow-up fix keeps the sampling anchor at the last accepted rake point.
Rejected small movements accumulate instead of resetting that anchor. The
latest pointer position is retained separately and committed on release or
before leaving the terrain, including segments shorter than the usual spacing.
Stationary clicks do not create marks. Rendering and groove style are unchanged.

Verified with `npm run verify:rake`:

- The original 80-move slow path, plus a 0.003-unit tail, now creates one
  stroke with 29 points rather than zero strokes.
- Start and end match x=4 and x=4.963 at z=6 within 0.0001 scene units.
- At fitted zoom, the canvas has 564 changed pixels instead of zero.
- Undo restores the exact blank canvas; redo restores the drawn canvas.
- A 0.005-unit drag is preserved, while a stationary click makes no mark.
- Escape cancellation, separate subpaths after leaving/re-entering, and save
  reload preserve the expected state.
- Native mobile touch input creates the same 29-point stroke and is undoable.

`npm run build` and the existing `npm run verify:ui` suite also passed.
The new slow-only mode fails on regression and writes to a separate directory,
preserving the original inspection evidence below.

Evidence: [Fixed slow stroke](../artifacts/rake-slow-fix/10-slow-zoomed.png),
[verification metrics](../artifacts/rake-slow-fix/results.json).

## Reproduced Problems

### 1. Slow movement is discarded instead of accumulated (fixed)

- Desktop 1440 x 960, zoom approximately 2.986 times the fitted view.
- Brush diameter 1.2; 80 consecutive moves of 0.012 scene units.
- Actual movement: x=4 to x=4.96, z=6.
- Result: zero saved rake marks. After camera reset, the before/after canvas
  pixel comparison is identical (zero changed pixels).
- A deterministic 100-sample pipeline reproduction also records zero marks.
- Cause: `model.ts:183-185` rejects segments shorter than 0.015, while
  `GardenInteraction.tsx:72-74` advances the previous point unconditionally.
- Recommendation: accumulate distance from the last accepted sample, preserve
  the start of the gesture and flush the final endpoint on release.

Evidence: [Zoomed slow stroke](../artifacts/rake-inspection/10-slow-zoomed.png)

### 2. Wide brushes fold over at tight turns

- Brush diameter 4.0; U-turn with a bend much smaller than the brush radius.
- Inner grooves form loops and intersect instead of remaining a clean band.
- Cause: `Terrain.tsx:27-38` offsets every tooth along a changing path normal,
  without accounting for local curvature or offset-curve self-intersections.
- Recommendation: constrain orientation changes or apply local rake stamps
  with overwrite semantics; explicitly test tight U-turns and reversals.

Evidence: [Wide U-turn](../artifacts/rake-inspection/08-wide-hairpin.png)

### 3. Weak depth and visibility

- A six-unit straight stroke is continuous, but the maximum RGB-channel
  change from blank sand is only 8/255 in the tested daylight view.
- At 390 x 844, the drawn curve is barely distinguishable at fitted zoom.
- `Terrain.tsx:85-91` only modulates diffuse color. It does not perturb the
  surface normal, so the groove shading does not respond like shallow relief.
- Recommendation: evaluate restrained normal/bump shading, adaptive line
  visibility and antialiasing at fitted mobile and desktop zoom levels.

Evidence: [Desktop straight](../artifacts/rake-inspection/02-straight.png),
[Mobile curve](../artifacts/rake-inspection/14-mobile-curve.png)

## Product Behavior To Confirm

Crossing a previous stroke retains both sets of grooves and creates a grid.
This follows the current additive drawing implementation. If the intended
experience is re-raking sand, a new stroke should replace old grooves within
its footprint. That overwrite behavior was not explicitly specified in the
earlier scope, so it is a recommended behavior change rather than a proven
contract violation.

Evidence: [Crossed strokes](../artifacts/rake-inspection/05-crossing.png)

## Verified Working

- A normal straight drag records one path with 31 points and renders lines.
- Undo returns the canvas to the exact blank baseline; redo exactly restores
  the drawn canvas (zero pixel differences in both comparisons).
- Reapplying white sand clears grooves using either a stationary dab or drag.
- Raking an all-grass fixture changes no canvas pixels. The path is still
  stored, but the shader hides it on non-sand surfaces.
- A mobile-size viewport records a curve with 33 points. This inspection used
  mouse-driven coordinates for that visual check, not native touch input.

## Limits

No full comparison against the original commercial game's renderer was made.
This is an inspection against the agreed continuous, natural drawing intent.
Mixed-material borders, very long session performance, varied terrain slopes,
and native touch rake gestures were not exhaustively tested in this pass.

Raw metrics: [results.json](../artifacts/rake-inspection/results.json)
