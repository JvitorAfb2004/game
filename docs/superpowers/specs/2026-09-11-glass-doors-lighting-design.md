# Spec: Glass Facade and Lighting

## Objective

Close each of the twelve office rooms with a glass facade that has a central
hinged door. The door swings inward like a real door when the player
approaches and closes when the player leaves. Add a visible ceiling with
lights so the space is bright instead of dark.

## Tech Stack

- React 19 and TypeScript
- Three.js 0.180 (MeshPhysicalMaterial, RoomEnvironment, PMREMGenerator)
- Existing Vite build, graphics presets, and performance work

## Commands

```sh
npm test
npm run build
npm run lint
```

## Project Structure

- `app/game/environment.ts` — glass facades, door pivots, frames, ceiling lights
- `app/game/engine.ts` — proximity door animation
- `verify-world.mjs` — facade and door assertions

## Code Style

Reuse the existing `createEnvironment` factory and `Game` class. Return the
door pivots from the environment so the engine animates them without owning
geometry.

## Design

### Glass facade

Each room entrance on the corridor side gets a facade at the room's
corridor-facing plane: dark charcoal frames, two glass side panels, and a
central glass door leaf. The door opening is about 1.2 units wide and 2.4 tall,
with a solid header up to the ceiling.

### Door

Each door leaf is parented to a pivot placed on one jamb. The leaf is offset
from the pivot so rotating the pivot about Y swings the door inward. The engine
keeps a target angle: `side * 1.55` radians when the player is within about
3 units, otherwise `0`, and lerps the pivot toward it. The glass side panels
collide; the door opening stays passable.

### Glass material

`MeshPhysicalMaterial` with `transparent`, low opacity, low roughness, a subtle
blue-green tint, and a scene environment map for reflections. Transmission is
intentionally omitted to avoid a full extra render pass.

### Lighting

The ceiling plane stays. Add emissive LED panels on the ceiling in the corridor
and one per room, a brighter hemisphere and ambient fill, a soft directional
light for shadows, and a small number of corridor point lights. Keep the total
light count low for performance.

## Boundaries

- Always: keep movement/collision working, keep graphics presets and
  optimizations, preserve UTF-8.
- Ask first: adding dependencies or using transmission glass.
- Never: reintroduce combat, or add one point light per room (twelve lights).

## Success Criteria

- Twelve glass facades, each with one hinged door.
- Doors swing inward when the player approaches and return when leaving.
- Glass is transparent with reflections and dark frames.
- The ceiling is present and the scene is visibly lit.
- Glass panels block movement; door openings are passable.
- `npm test`, `npm run build`, and `npm run lint` pass.
- No `�` replacement characters are introduced.

## Open Questions

None for this iteration.
