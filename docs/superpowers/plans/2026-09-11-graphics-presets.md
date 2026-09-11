# Graphics Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session-only `FRACO`, `MEDIO`, and `FORTE` graphics presets to the existing settings panel and apply measurable rendering-cost changes.

**Architecture:** Keep the existing React settings state and `Game.configure` flow. Add one small pure profile module for preset values, keep one maximum rain buffer with a runtime active count, and apply renderer, shadow, bloom, and pixel-ratio settings in `Game`. Gameplay and collision geometry remain untouched.

**Tech Stack:** React 19, TypeScript, Three.js 0.180, Vite, Node assertion checks.

## Global Constraints

- The default is `medium`, and the setting is session-only.
- Preserve gameplay behavior, collisions, controls, and HUD.
- Keep the current settings panel and visual language.
- Do not add dependencies or save persistence.
- The cinematic toggle remains independent and disables bloom when off.
- Run `npm test`, `npm run build`, and `npm run lint` before completion.

---

### Task 1: Define and verify graphics profiles

**Files:**
- Create: `app/game/graphics.ts`
- Create: `verify-graphics.mjs`
- Modify: `package.json:11-17`

**Interfaces:**
- Produces `GraphicsPreset`, `GraphicsProfile`, and `getGraphicsProfile(preset)` for the UI, engine, and environment.
- `GraphicsProfile` contains `pixelRatio`, `shadowMapSize`, `shadows`, `bloomStrength`, and `rainCount`.

- [ ] **Step 1: Write the failing profile check**

Create `verify-graphics.mjs` with assertions for the three ordered profiles and the fallback/default behavior:

```js
import assert from 'node:assert/strict';
import { getGraphicsProfile } from './app/game/graphics.ts';

const low = getGraphicsProfile('low');
const medium = getGraphicsProfile('medium');
const high = getGraphicsProfile('high');

assert(low.pixelRatio < medium.pixelRatio && medium.pixelRatio < high.pixelRatio);
assert(low.shadowMapSize < medium.shadowMapSize && medium.shadowMapSize < high.shadowMapSize);
assert(!low.shadows && medium.shadows && high.shadows);
assert(low.rainCount < medium.rainCount && medium.rainCount < high.rainCount);
assert.equal(getGraphicsProfile('medium').bloomStrength, medium.bloomStrength);
console.log('graphics profiles: ok');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --experimental-strip-types verify-graphics.mjs`

Expected: FAIL because `app/game/graphics.ts` does not exist.

- [ ] **Step 3: Implement the minimal profile module**

Create `app/game/graphics.ts`:

```ts
export type GraphicsPreset = 'low' | 'medium' | 'high';

export type GraphicsProfile = {
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  bloomStrength: number;
  rainCount: number;
};

const profiles: Record<GraphicsPreset, GraphicsProfile> = {
  low: { pixelRatio: 0.75, shadows: false, shadowMapSize: 512, bloomStrength: 0, rainCount: 250 },
  medium: { pixelRatio: 1, shadows: true, shadowMapSize: 1024, bloomStrength: 0.16, rainCount: 550 },
  high: { pixelRatio: 1.5, shadows: true, shadowMapSize: 2048, bloomStrength: 0.24, rainCount: 900 },
};

export const getGraphicsProfile = (preset: GraphicsPreset): GraphicsProfile =>
  profiles[preset];
```

- [ ] **Step 4: Add the check to the existing test command**

Change `package.json` so `npm test` also runs `verify-graphics.mjs`:

```json
"test": "node --experimental-strip-types verify-world.mjs && node --experimental-strip-types verify-combat.mjs && node --experimental-strip-types verify-graphics.mjs"
```

- [ ] **Step 5: Run the focused check**

Run: `node --experimental-strip-types verify-graphics.mjs`

Expected: `graphics profiles: ok`.

- [ ] **Step 6: Commit the profile contract**

```sh
git add app/game/graphics.ts verify-graphics.mjs package.json
git commit -m "feat: define graphics quality profiles"
```

### Task 2: Apply profiles in the game engine

**Files:**
- Modify: `app/game/engine.ts:6-7,155-250,350-361`
- Modify: `app/game/environment.ts:10-13,1087-1113`

**Interfaces:**
- Consumes `GraphicsPreset` and `getGraphicsProfile` from `app/game/graphics.ts`.
- `createEnvironment(THREE, scene)` allocates the maximum rain buffer and returns `setRainCount(count)` and `setShadowMapSize(size)`.
- `Game.configure` accepts `{ graphics: GraphicsPreset; muted: boolean; sensitivity: number; cinematic: boolean }`.

- [ ] **Step 1: Write the environment parameter change**

Keep the environment signature and add an active count beside the fixed maximum:

```ts
export function createEnvironment(THREE: typeof ThreeType, scene: ThreeType.Scene) {
  const rainCount = 900;
  let activeRainCount = rainCount;
```

Update the rain loop to iterate to `activeRainCount`, return `setRainCount(count) { activeRainCount = Math.max(0, Math.min(rainCount, count)); }`, and leave inactive buffer entries untouched. Also return `setShadowMapSize(size)` that visits scene lights with shadows and calls `light.shadow.mapSize.set(size, size)`. This changes active particle and shadow work without rebuilding the scene.

- [ ] **Step 2: Pass the medium profile during engine construction**

Import `getGraphicsProfile` and keep the existing environment construction. The profile is applied through `configure` after the engine is ready:

```ts
this.env = createEnvironment(THREE, this.scene);
```

- [ ] **Step 3: Apply profile values in `configure`**

Replace the existing `configure` signature/body with:

```ts
configure(o: {
  graphics: GraphicsPreset;
  muted: boolean;
  sensitivity: number;
  cinematic: boolean;
}) {
  const profile = getGraphicsProfile(o.graphics);
  this.sound.setMute(o.muted);
  this.sensitivity = o.sensitivity;
  this.cinematic = o.cinematic;
  this.renderer.setPixelRatio(Math.min(devicePixelRatio, profile.pixelRatio));
  this.renderer.shadowMap.enabled = profile.shadows;
  this.env.setShadowMapSize(profile.shadowMapSize);
  this.bloom.enabled = o.cinematic && profile.bloomStrength > 0;
  this.bloom.strength = o.cinematic ? profile.bloomStrength : 0;
  this.env.setRainCount(profile.rainCount);
  this.resize();
}
```

Set the initial renderer pixel ratio to `1` in the constructor; `configure` will immediately apply the React default profile after the engine becomes ready. Keep the existing shadow-map type, tone mapping, and scene geometry unchanged.

- [ ] **Step 4: Verify engine types and gameplay tests**

Run: `npm test`

Expected: all world, combat, and graphics checks pass.

- [ ] **Step 5: Commit engine integration**

```sh
git add app/game/engine.ts app/game/environment.ts
git commit -m "feat: apply graphics profiles to renderer"
```

### Task 3: Add the selector to settings

**Files:**
- Modify: `app/page.tsx:18-20,45-52,53-74,402-446`
- Modify: `app/globals.css` only if the existing settings control needs a selector-specific style

**Interfaces:**
- Consumes `GraphicsPreset` from `app/game/graphics.ts`.
- Produces a controlled `graphics` state defaulting to `'medium'` and passes it through `Game.configure`.

- [ ] **Step 1: Add controlled graphics state and configure dependency**

Import the type and use the existing state pattern:

```tsx
import type { GraphicsPreset } from './game/graphics';

const [graphics, setGraphics] = useState<GraphicsPreset>('medium');
```

Include `graphics` in the configure object and effect dependency list:

```tsx
engine.current?.configure({ muted, sensitivity, cinematic, graphics });
```

- [ ] **Step 2: Render the three accessible choices**

Place this block in the settings panel before the sensitivity slider:

```tsx
<fieldset className="graphics-setting">
  <legend>Graphics quality</legend>
  <div role="radiogroup" aria-label="Graphics quality">
    {(['low', 'medium', 'high'] as const).map((value) => (
      <button
        key={value}
        type="button"
        role="radio"
        aria-checked={graphics === value}
        className={graphics === value ? 'selected' : ''}
        onClick={() => setGraphics(value)}
      >
        {value === 'low' ? 'FRACO' : value === 'medium' ? 'MEDIO' : 'FORTE'}
      </button>
    ))}
  </div>
</fieldset>
```

Use buttons rather than clickable divs so keyboard activation and focus work without custom handlers.

- [ ] **Step 3: Add only the required selector styling**

Follow the existing settings colors, borders, spacing, and focus style. Do not add a new component or dependency. The selected state must be communicated by border/background and `aria-checked`, not color alone.

- [ ] **Step 4: Run the full verification set**

Run:

```sh
npm test
npm run build
npm run lint
```

Expected: all commands exit successfully.

- [ ] **Step 5: Manually verify the user flow**

Run: `npm run dev`

Open the game, open settings, confirm `MEDIO` is selected, switch to `FRACO` and `FORTE`, confirm the operation remains playable, toggle cinematic effects independently, and use keyboard Tab/Enter to operate the selector.

- [ ] **Step 6: Commit the settings UI**

```sh
git add app/page.tsx app/globals.css
git commit -m "feat: add graphics preset setting"
```

## Self-Review

- Spec coverage: UI selector, medium default, renderer quality controls, rain count, independent cinematic toggle, unchanged gameplay boundaries, and all required verification commands are covered by Tasks 1-3.
- Placeholder scan: no `TODO`, `TBD`, or vague implementation steps remain.
- Type consistency: `GraphicsPreset` is defined once in `app/game/graphics.ts`, consumed by `Game.configure` and `page.tsx`, and the profile fields are used consistently by the engine and environment.
- Deliberate limitation: the environment allocates the maximum rain buffer once; low and medium presets reduce active particle updates rather than rebuilding scene geometry.
