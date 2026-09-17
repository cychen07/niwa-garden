# Garden Expansion

## Scope

- Add cherry, azalea, iris, stepping stones, bamboo fence, torii, pavilion,
  bench, stone pagoda and shishi-odoshi to the existing object palette.
- Keep free placement, selection, rotation, scale and undo behavior for all
  objects. New models use the same procedural low-poly Three.js style.
- Add scroll buttons to the palette for desktop and touch-sized layouts.
- Change the square terrain size through the persistent slider directly below
  the title at the top of the editor. Supported side lengths are 7, 9, 11, 13,
  15, 17 and 19 scene units.

## Resize Semantics

- The center stays at the same world position; objects do not scale.
- Enlarging adds grass around the existing garden and extends edge elevation.
- Shrinking crops the outer terrain and rake display. Objects that would
  overhang move inside the nearest boundary, reserving space for their scaled
  footprint; objects are not deleted or scaled.
- Relocated objects may overlap. Resizing does not automatically rearrange
  the garden or resolve object collisions.
- Dragging shows the candidate side lengths, total cells and terrain/object
  consequences. Releasing shows confirm/cancel; either action hides the
  feedback. Merely dragging never changes the garden.
- Keyboard range controls work with the same confirmation step. Escape,
  pointer cancellation and returning to the current size discard the proposal.
- No extra toast is shown after confirming a size.
- Each resize is one immutable history entry. Undo/redo restores geometry,
  object positions, size and rake clipping together.
- Rake paths retain their coordinates, with a persisted clipping rectangle
  when cropped. Enlarging again does not resurrect cropped grooves.
- The mesh resolution scales with garden size to retain brush precision.
- Camera fitting, plinth dimensions, shadows, weather and editing bounds
  follow the garden size.

## Persistence

Version 3 saves include size and optional rake clipping bounds. Loading v2
preserves its 11-unit terrain arrays and object coordinates; v1 tile saves
continue to migrate. The v1/v2 storage keys are read-only migration sources.
New saves go to `niwa-garden-v3`.

## Acceptance

- All ten new kinds place, render, transform and persist through reload.
- Min/default/max sizes frame correctly on desktop and mobile.
- The enlarged outer area accepts objects, painting, sculpting and rake marks.
- Canceling a size proposal does not edit the garden; confirmed shrinking retains
  object count and keeps anchors in bounds.
- Resize undo restores the prior snapshot exactly, including rake paths.
- Migration covers both prior formats and does not overwrite either source.
- Existing construction and slow-rake regressions remain green.

## Verification

- `npm run build`: TypeScript and production bundle compile. Vite retains its
  existing large-chunk advisory for the Three.js bundle.
- `npm run verify:expansion`: all ten new objects, enlarged-area editing,
  resize cancellation, footprint margins, undo/redo, reload and v2 migration.
- `npm run verify:size-camera`: header slider drag/release/confirmation,
  keyboard and native touch, history/reload, responsive layout, and screenshot
  pixel measurements of equal square side lengths after orbiting.
- `npm run verify:ui`: existing construction, native touch, export and v1
  migration workflows.
- `npm run verify:rake`: slow strokes, short tails, cancellation, re-entry,
  visual undo/redo and native touch.
- Minimum/maximum heights are tested at every supported size. Resampled
  heights are clamped to their valid range to avoid floating-point rounding
  invalidating saves at the minimum elevation.
- Desktop (1440 x 960), mobile (390 x 844) and small-mobile (320 x 640)
  screenshots and canvas samples cover framing and control overlaps.
- The size/camera suite also covers tablet (900 x 760) and narrow-tablet
  (721 x 900). Layout is sampled after a paint, including repeated keyboard
  proposals and clicking the already-selected size.
- The flat 15-unit garden measures 558 x 558, 390 x 390, 353 x 352,
  236 x 236 and 163 x 163 pixels in top view, respectively for desktop,
  tablet, narrow-tablet, mobile and small-mobile. Each viewport has equal
  horizontal widths at 20%, 50% and 80% of the garden height.

Evidence: [new elements](../artifacts/expansion/all-new-elements.png),
[mobile resizing](../artifacts/expansion/mobile-7.png),
[expansion metrics](../artifacts/expansion/results.json),
[size/camera metrics](../artifacts/size-camera/results.json).

## Camera And Base

The garden has equal X/Z dimensions and uses an orthographic projection.
The old rounded base used a corner radius larger than half its thickness;
it has been replaced with two thin, straight-sided square meshes. The terrain
skirt is closed at its last corner. Default X/Z camera offsets are symmetric,
and the top-view button resets orbit momentum before aligning directly above
the garden. Orbit elevation remains at the original 15-90 degree range for
both the editor and previews. The foundation and lower plinth now share one
square footprint; the lower layer no longer flares outward and reads as a
trapezoid at the minimum elevation. Freely rotated views still foreshorten the
square naturally; only an axis-aligned top view has equal screen-space width
and depth. No terrain or object scaling is applied to compensate for the
camera.

Camera framing is shared between the scene and interaction test projection
helpers. Header and mobile tool areas are reserved when fitting the scene.

`npm run verify:low-angle` runs against the Vite development server. It reads
the live orthographic camera and base corners, checks the original 15-degree
minimum, matching foundation/plinth footprints, equal X/Z dimensions and
equal/parallel opposite edges from four directions,
and exercises left-button and native touch rotation, top view and save
isolation. It covers 7-, 15- and 19-unit gardens on desktop, mobile and
small-mobile. Screenshots and camera measurements are in `artifacts/low-angle`.
