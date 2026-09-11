# Spec: Graphics Presets

## Objective

Add three graphics presets to the existing settings panel so players can
choose a configuration for weak, medium, or powerful PCs. The preset must
change rendering cost without changing gameplay, collisions, controls, or HUD.
The default is `medium`, and the setting is session-only.

## Tech Stack

- React 19 and TypeScript
- Three.js 0.180
- Existing Vite build and shadcn UI components

## Commands

```sh
npm test
npm run build
npm run lint
```

## Project Structure

- `app/page.tsx` — settings state and graphics preset selector
- `app/game/engine.ts` — renderer and post-processing configuration
- `app/game/environment.ts` — environment detail controlled by the preset
- `docs/superpowers/specs/` — feature specification

## Code Style

Reuse the existing `Game.configure` path and keep the preset as a narrow union
type rather than introducing a new settings framework:

```ts
type GraphicsPreset = 'low' | 'medium' | 'high';

configure(options: { graphics: GraphicsPreset; muted: boolean; ... }) {
  // Apply the selected renderer settings.
}
```

The settings panel uses the existing controls and visual language. Labels are
visible and the selected option is exposed to keyboard and screen-reader users.

## Testing Strategy

- Type-check and bundle with `npm run build`.
- Run existing gameplay checks with `npm test`.
- Run `npm run lint`.
- Manually verify each preset updates renderer settings, the default is medium,
  and changing presets does not reset the current operation.

## Boundaries

- Always: preserve gameplay behavior, keep the current settings panel, and
  validate all three preset values at the TypeScript boundary.
- Ask first: adding dependencies, changing save persistence, or reducing scene
  geometry/collision data.
- Never: remove existing cinematic, audio, or sensitivity settings; commit
  secrets; alter combat rules to compensate for rendering cost.

## Design

The UI adds a single graphics selector with `FRACO`, `MEDIO`, and `FORTE`,
defaulting to `MEDIO`. The selected value flows through the existing React
effect into `Game.configure`.

The engine applies the profile to antialiasing-compatible render settings,
pixel ratio, shadow-map usage and size, bloom enablement/intensity, and rain
particle count. The cinematic toggle remains an independent upper bound: when
disabled, bloom is off regardless of the graphics preset.

The environment receives the chosen rain count at construction time. Existing
world geometry and collision data remain unchanged so gameplay and tests stay
stable. Presets apply immediately to renderer/post-processing values; the rain
count is selected when the game engine is initialized.

## Success Criteria

- The settings panel visibly offers `FRACO`, `MEDIO`, and `FORTE`.
- A new session starts with `MEDIO` selected.
- Low uses less rendering work than medium, and medium less than high for
  pixel ratio, shadows, bloom, and rain particles.
- Cinematic effects can still be disabled independently.
- `npm test`, `npm run build`, and `npm run lint` pass.
- No `�` replacement characters are introduced.

## Open Questions

None for this iteration.
