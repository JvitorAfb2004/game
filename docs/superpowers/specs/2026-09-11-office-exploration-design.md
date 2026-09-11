# Spec: Office Exploration

## Objective

Turn the existing FPS prototype into a light first-person office walkthrough.
A straight central corridor has twelve empty rooms, six on each side, each
with an open entrance and one idle character inside. The player walks, runs,
and looks around with no weapons or combat. The goal is a calm, navigable
space that reuses the existing movement and character foundations.

## Tech Stack

- React 19 and TypeScript
- Three.js 0.180
- Existing Vite build, presets, and performance work

## Commands

```sh
npm test
npm run build
npm run lint
```

## Project Structure

- `app/game/environment.ts` — office floor plan: corridor, twelve rooms, walls
- `app/game/engine.ts` — movement, collision, camera, and idle characters
- `app/game/character.ts` — simple idle character (replaces `enemy.ts`)
- `app/page.tsx` and `app/globals.css` — minimal interface and menu
- `app/game/weapon.ts` — removed; no weapons remain

## Code Style

Keep the existing `Game` class and `createEnvironment` factory. Replace combat
with a small set of idle characters that reuse the existing character model
scaffolding without weapons.

## Design

### Layout

A straight corridor along one axis with six rooms on the left and six on the
right, for twelve rooms total. Each room is a rectangular box with walls,
floor, and ceiling, and a single open entrance facing the corridor. Rooms are
empty. Dimensions are chosen so the player can walk the full length and enter
any room without doors.

### Player

First-person camera with WASD and arrow-key movement, mouse look, and Shift to
sprint. Collision keeps the player inside the corridor and rooms. No health,
ammo, aiming, or combat state remains.

### Characters

One idle character per room, twelve total. Each stands in its room with a
subtle idle animation. They do not fight, take damage, or block the player
beyond a simple stand-in presence.

### Interface

The military HUD (reticle, minimap, ammo, objective, radar) is removed. The
menu becomes a single entry action. A minimal frame can remain for context,
but no combat elements persist.

## Boundaries

- Always: reuse existing movement and collision; keep the current build,
  presets, and performance optimizations; preserve UTF-8 text.
- Ask first: adding dependencies, changing the room count from twelve, or
  introducing furniture and gameplay beyond walking.
- Never: reintroduce weapons or combat, or delete the existing graphics
  preset and optimization work.

## Success Criteria

- The game starts on a main menu and enters the office on one action.
- The office shows a straight corridor with twelve empty rooms, six per side.
- Each room contains one idle character.
- The player walks, runs, and collides with walls; no weapons or combat exist.
- `npm test`, `npm run build`, and `npm run lint` pass.
- No `�` replacement characters are introduced.

## Open Questions

None for this iteration.
