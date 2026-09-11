# Spec: Wooden Doors, Frosted Glass, Lighting and Switch Interaction

## Objective

Replace the glass doors with wooden Brazilian-style room doors, make the glass
frosted (smoky), reduce overall brightness, cut rendering cost further so low
presets run smoothly, add a center reticle, and make the room light switch
interactive: aim at it and press E to toggle the room light, with a bottom
center prompt.

## Tech Stack

- React 19 and TypeScript
- Three.js 0.180
- Existing Vite build, graphics presets, and instancing work

## Commands

```sh
npm test
npm run build
npm run lint
```

## Project Structure

- `app/game/environment.ts` — wooden door, frosted glass, per-room lights and switches
- `app/game/engine.ts` — proximity room lights, switch raycast, E toggle
- `app/page.tsx` and `app/globals.css` — center reticle and interaction prompt
- `verify-world.mjs`, `verify-movement.mjs` — assertions

## Design

### Wooden door

The central door leaf becomes wood (`0x6b4a2f`, high roughness) with a darker
wood edge and a small metal handle. The facade frame and side panels stay.

### Frosted glass

Glass becomes frosted/smoky: higher opacity (about 0.55), higher roughness
(about 0.65), a light tint, no environment map. The scene `environment` (IBL)
is removed, which also cuts per-fragment cost.

### Lighting

Global fill drops (hemisphere and ambient reduced, directional softer). The
corridor keeps two dim point lights. Each room has one point light and one
emissive LED panel that toggle together. Room lights turn on by proximity
(about 6 units) and respect the switch state, keeping the active light count
small. Lights do not cast shadows.

### Reticle and interaction

A small center reticle is always visible while playing. Each room's switch sits
on the lateral wall near the door. When the player looks at a switch within
about 3 units, a bottom center prompt appears: press E to turn the room light
off/on. Pressing E toggles that room's point light and LED panel.

## Boundaries

- Always: keep movement/collision, graphics presets, instancing, and UTF-8.
- Ask first: adding dependencies, or re-enabling scene environment / IBL.
- Never: reintroduce combat, or 12 always-on lights.

## Success Criteria

- Doors are wooden with a handle; glass is frosted.
- Overall brightness is lower than before.
- Room lights toggle with E when the switch is targeted.
- A center reticle and a bottom center prompt appear.
- Room lights use proximity so few lights are active.
- `npm test`, `npm run build`, and `npm run lint` pass.
- No `�` replacement characters are introduced.

## Open Questions

None for this iteration.
