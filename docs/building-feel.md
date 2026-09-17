# Building Feel

## Scope

- Replace individual tiles with a 64 x 64 segment continuous heightfield.
- Drag a circular brush to paint, raise, lower, or smooth the terrain.
- Preview brush diameter; interpolate fast pointer movement without gaps.
- Draw parallel sand grooves along the pointer path, clipped to sand.
- Place objects at fractional positions, select and drag existing objects,
  rotate and scale them with contextual controls.
- Keep camera navigation available while building without stealing direct edit
  gestures.
- Play an original Japanese-garden ambient playlist and keep the selected
  template visible as a build reference.
- Treat a complete drag or slider adjustment as one undoable transaction.
- Load legacy v1 gardens without overwriting the original save.

## Interaction

1. Desktop keeps five primary categories in a left rail. Clicking one opens a
   stable catalogue drawer; hover only previews and never changes the tool.
   Plants, structures and decorations use explicit second-level tabs.
2. Mobile uses the same five categories as a bottom rail. Its catalogue opens
   as a bottom drawer and closes after a tool is chosen.
3. Choose a ground/terrain tool, adjust diameter in the bottom contextual
   control, and drag on the garden.
4. Choose a plant/object, preview it in the catalogue and as a translucent
   object on the terrain, then place it.
5. Placement enters selection mode. Drag the object directly, or use the
   bottom direction and size controls. Direction snaps at 45-degree intervals.
6. Camera navigation remains available in every editor mode. Left-drag empty
   scene space to rotate; hold Space and left-drag, or middle-drag, to rotate
   over the garden. The wheel zooms at any time outside an active edit.
   Two-finger touch combines zoom and rotation.
7. Direct left-button gestures on the garden keep their editing meaning:
   painting, sculpting, placement or moving an object. The orbit toolbar mode
   remains as an explicit fallback. Right-button orbit stays disabled.
8. Escape cancels an active edit. Pointer cancellation rolls the edit back;
   releasing outside the canvas or losing window focus finishes the transaction.

## Ambience and reference

- Start with "Creek Bridge after Rain" and rotate through four original
  procedural tracks with plucked strings, flute, bells and running water.
- Request playback on entry, then resume on the first pointer or keyboard
  interaction when browser autoplay policy blocks audio.
- Provide compact mute/play and next-track controls. Persist the enabled state
  in local storage, not the current draft.
- When a draft starts from a template, render that template's real 3D scene in
  a fixed top-right reference. Restore it from `templateId` after reload and
  hide it only when another overlay needs the same screen space.

## Implementation

Use the existing React, React Three Fiber and Three.js stack. Three.js provides
heightfield geometry, raycasting, curve interpolation and OrbitControls. Store
terrain samples and rake paths, not GPU resources, in a versioned JSON save.
Keep snapshot history immutable and free of side effects in React state updaters.

## Acceptance

- Fast drags produce connected paint and curved rake tracks.
- Larger brushes affect a larger area; holding a sculpt tool raises/lowers
  gradually without moving the camera.
- Object placement/movement uses fractional coordinates and follows terrain.
- Hovering a primary category does not open it; clicking locks the category.
- The desktop catalogue stays on the left and the mobile catalogue behaves as
  a bottom drawer. Selecting an object leaves only contextual controls visible.
- One undo restores the whole gesture; redo and reloaded saves match exactly.
- Cancel, pointer release outside, and camera gestures do not leave painting on.
- Empty-space left drags, Space + left drags, middle drags and wheel zoom never
  edit the garden or create undo entries. Right-button drags leave both the
  view and garden unchanged.
- The ambient playlist starts with its default track, supports mute and next,
  and can recover from browser autoplay blocking on first interaction.
- Template drafts show a nonblank reference on desktop and mobile, retain it
  after reload, and do not overlap the editor controls.
- Desktop/mobile screenshots show a fully framed, nonblank, animated scene and
  non-overlapping usable controls.

Run `npm run verify:catalog` for catalogue hover/click behavior, second-level
tabs, desktop/mobile drawer behavior, placement, 45-degree rotation, scaling,
deletion and responsive layout.

Run `npm run verify:ambience` for music controls, camera gestures, save
isolation, template persistence and desktop/mobile reference layouts.
