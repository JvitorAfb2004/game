# Spec: XP Desktop — remove cinematic, swap characters for desks

## Objective

Remove the cinematic/bloom path entirely, remove the 12 room characters, and
put one simple industrial desk with a notebook in each room. Aiming at a
notebook and left-clicking opens a fullscreen Windows XP-style desktop
(wallpaper, icons, taskbar with a working Start menu and clock). ESC returns
to the game.

## Tech Stack

- React 19 and TypeScript, Three.js 0.180, Vite
- Existing instancing, presets, interaction prompt, and verification scripts

## Commands

```sh
npm test
npm run build
npm run lint
```

## Project Structure

- `app/game/engine.ts` — drop bloom/cinematic/characters; add notebook aim + click + desktop mode
- `app/game/environment.ts` — instanced desks + notebooks; expose notebook targets
- `app/game/graphics.ts` — drop `bloomStrength`
- `app/game/character.ts` — deleted
- `app/page.tsx`, `app/globals.css` — drop cinematic setting; add XP overlay
- `verify-graphics.mjs`, `verify-world.mjs` — update assertions

## Design

### 1. Cinematic removal

Delete `UnrealBloomPass` import, field, pass, and all `bloom.*` lines. Drop the
`cinematic` parameter from `configure` and the settings switch in `page.tsx`.
Remove `bloomStrength` from `GraphicsProfile` and the related assertion in
`verify-graphics.mjs`. Composer keeps RenderPass + OutputPass.

### 2. Character removal

Delete `addCharacters`, the per-frame character update, and the character
import in `engine.ts`. Delete `app/game/character.ts`. Remove the character
budget test and canvas mock from `verify-world.mjs` (environment needs no DOM
mock).

### 3. Desk + notebook

Per room, at the room center: a wooden top with four dark metal legs
(industrial look), plus a notebook (dark base + lit screen). All static parts
go through the existing instanced `box()` batches. The desk gets a collider so
the player cannot walk through it. `createEnvironment` returns
`notebooks: { x, y, z }[]` with the screen position of each notebook.

### 4. Interaction

`updateRooms` also picks a notebook target by view angle and distance (same
pattern as the light switch). Prompt text becomes "CLIQUE PARA ACESSAR O
NOTEBOOK". Left mouse click while a notebook is targeted enters desktop mode:
`Snapshot.desktop` becomes true and pointer lock is released. ESC exits
desktop mode and returns to play. While desktop is open the game does not
advance the player.

### 5. XP overlay

`page.tsx` renders a fullscreen overlay when `state.desktop` is true: CSS
wallpaper gradient, desktop icons, and a taskbar with a Start button opening a
simple menu plus a live clock. No program windows in this version. All styling
is plain CSS in `globals.css`; no image assets.

## Boundaries

- Always: keep movement, collision, doors, lights, switches, presets (minus
  bloom), and UTF-8 text.
- Ask first: adding dependencies or image assets.
- Never: reintroduce combat, bloom, or characters.

## Success Criteria

- No `cinematic`, `bloom`, or `UnrealBloomPass` references remain in `app/`.
- No character renders in any room; 12 desks with notebooks do.
- Aiming at a notebook shows the access prompt; left-click opens the XP
  desktop fullscreen; ESC returns to the game.
- XP overlay shows wallpaper, icons, taskbar, working Start menu, and clock.
- `npm test`, `npm run build`, and `npm run lint` pass.
- No `�` replacement characters are introduced.

## Open Questions

None for this iteration.
