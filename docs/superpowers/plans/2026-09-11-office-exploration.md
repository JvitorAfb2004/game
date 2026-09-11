# Office Exploration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the FPS prototype into a light first-person office walkthrough: a straight corridor with twelve empty rooms (six per side), one idle character per room, and no weapons or combat.

**Architecture:** Reuse the existing `Game` class, movement/collision, graphics presets, and performance work. Replace the terminal environment with an office floor plan, replace the armed enemy with an unarmed idle character, strip combat/weapon/HUD from the engine and interface, and adapt the verification scripts.

**Tech Stack:** React 19, TypeScript, Three.js 0.180, Vite, Node assertion checks.

## Global Constraints

- Twelve rooms total: six on the left and six on the right of a straight corridor.
- Each room is empty with one open entrance and one idle character.
- No weapons, shooting, ammo, health, aiming, combat, or extraction.
- Reuse movement/collision and keep the graphics presets and matrix/particle optimizations.
- Keep the current build (`npm test`, `npm run build`, `npm run lint` passing) and UTF-8 text.

---

### Task 1: Idle character module

**Files:**
- Create: `app/game/character.ts` (derived from `app/game/enemy.ts`)

**Interfaces:**
- Produces `createCharacter(THREE, scene, x, z, offset)` returning `{ group, legs, arms, torso, head, update(time) }`.
- No `hitMeshes`, no `flash`, no `dead`, no rifle.

- [ ] **Step 1: Copy enemy.ts to character.ts and strip the weapon**

Create `app/game/character.ts` as a copy of `enemy.ts`, then apply these exact changes:

1. Rename the function: `export function createEnemy(` → `export function createCharacter(` and drop the `index` parameter, leaving `(THREE, scene, x, z, offset)`.
2. Delete the rifle group block — from the comment `// Carbine correctly shouldered` through the flash mesh creation and `rifle.add(flash)`. The `flash` name lookup and the `rifle` group must not exist.
3. Delete the two sling `limb(torso, seam, ...)` calls that connect the torso to the rifle.
4. In `arm()`, replace the `wrist` definition so both arms hang at the sides instead of holding a rifle:

```ts
const wrist = side > 0 ? V(-0.02, -0.55, 0.04) : V(0.02, -0.55, 0.04);
```

5. In the merge loop, replace the hit/head tagging so no combat data remains:

```ts
const mesh = new THREE.Mesh(geometry, material);
mesh.castShadow = true;
mesh.receiveShadow = true;
parent.add(mesh);
```

6. Change the clone + return so the character keeps only idle parts:

```ts
const group = operatorTemplate.clone(true);
group.position.set(x, 0, z);
scene.add(group);
const legs = [group.getObjectByName('legL')!, group.getObjectByName('legR')!] as ThreeType.Group[];
const arms = [group.getObjectByName('armL')!, group.getObjectByName('armR')!] as ThreeType.Group[];
const torso = group.getObjectByName('torso')!, head = group.getObjectByName('head')!;
return {
  group,
  legs,
  arms,
  torso,
  head,
  update(time: number) {
    const phase = time * 1.6 + offset;
    torso.position.y = Math.sin(phase) * 0.004;
    head.position.y = torso.position.y;
    head.rotation.y = Math.sin(time * 0.63 + offset) * 0.023;
    arms.forEach((arm, i) => {
      arm.rotation.x = Math.sin(time * 1.6 + offset + i * 0.5) * 0.005;
    });
  },
};
```

- [ ] **Step 2: Verify the module type-checks**

Run: `npm run build`

Expected: build passes. `character.ts` is valid TypeScript even though it is not yet imported.

- [ ] **Step 3: Commit the character module**

```sh
git add app/game/character.ts
git commit -m "feat: add unarmed idle character"
```

### Task 2: Office floor plan

**Files:**
- Modify: `app/game/environment.ts` (full rewrite)
- Modify: `verify-world.mjs`

**Interfaces:**
- Produces `createEnvironment(THREE, scene)` returning `{ colliders, setShadowMapSize(size), setRainCount(count), spawnPoints, update(dt, time) }`, where `spawnPoints` are the twelve room centers and `setRainCount` is a no-op (rain is removed; the engine drops its call in Task 3).
- `colliders` entries use the existing `{ minX, maxX, minZ, maxZ, maxY }` shape so movement and the wall test still work.

- [ ] **Step 1: Rewrite environment.ts to build the office**

Replace the entire body of `createEnvironment` with an office generator. Keep the `Collider` type and the return shape. Core layout values:

```ts
const corridorWidth = 3;   // x from -1.5 to 1.5
const roomDepth = 5.5;     // x from ±1.5 to ±7
const roomWidth = 7;       // z extent of each room
const roomGap = 1.5;       // wall between rooms
const ceiling = 3;
const roomCenters = [10, 1.5, -7, -15.5, -24, -32.5]; // 6 rooms
```

For each `side` of `-1` and `1` and each `center` in `roomCenters`, build:

```ts
function room(side: number, center: number) {
  const xFar = side * 7;
  const xNear = side * 1.5;
  const z0 = center - roomWidth / 2;
  const z1 = center + roomWidth / 2;

  // floor
  floor(xNear, xFar, z0, z1);
  // ceiling
  ceilingPlane(xNear, xFar, z0, z1);
  // back wall (away from corridor)
  wall(xFar, z0, z1, side);
  // side walls (one at each z edge)
  wallSide(xNear, xFar, z0);
  wallSide(xNear, xFar, z1);

  // colliders for the three solid walls
  collider(xFar, z0, z1, side);          // back wall
  colliderSide(xNear, xFar, z0);          // z0 wall
  colliderSide(xNear, xFar, z1);          // z1 wall
}
```

Walls are simple `THREE.Mesh` boxes with a shared `MeshStandardMaterial`. Floors and ceilings are planes. The entrance (corridor side at `xNear`) has no wall. Add a plain background color and a hemisphere light so the space is lit. No fog, no rain, no instancing needed for this small scene.

Return `spawnPoints` as the twelve `{ x: side * 4.25, z: center }` positions (one per room), and keep `setRainCount` as a no-op and `setShadowMapSize` visiting shadow-casting lights.

- [ ] **Step 2: Rewrite verify-world.mjs for the office**

Replace the terminal assertions with office assertions:

```js
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createEnvironment } from './app/game/environment.ts';

const gradient = { addColorStop() {} };
const context = new Proxy(
  { createLinearGradient() { return gradient; }, createRadialGradient() { return gradient; } },
  { get(target, key) { return key in target ? target[key] : () => {}; } },
);
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };

const scene = new THREE.Scene();
const env = createEnvironment(THREE, scene);

assert.equal(env.spawnPoints.length, 12, 'twelve room characters');
assert(env.colliders.length > 0, 'office has walls');

// The corridor center line is clear end to end.
const blocked = (x, z, r = 0.32) =>
  env.colliders.some((c) =>
    x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ,
  );
for (let z = 14; z > -36; z -= 0.5) assert(!blocked(0, z), `corridor clear at z=${z}`);

// Each room entrance is open (no wall at the corridor-facing opening).
for (const p of env.spawnPoints) {
  const side = Math.sign(p.x);
  assert(!blocked(side * 1.6, p.z), `room entrance open at ${p.x},${p.z}`);
}

env.update(0.016, 1);
console.log(JSON.stringify({ checks: 'office corridor, twelve rooms, open entrances', colliders: env.colliders.length, characters: env.spawnPoints.length }, null, 2));
```

- [ ] **Step 3: Run the office check**

Run: `npm test`

Expected: `verify-world.mjs` prints the office checks; `verify-graphics.mjs` still passes. `verify-combat.mjs` still passes because the engine is unchanged in this task.

- [ ] **Step 4: Commit the office floor plan**

```sh
git add app/game/environment.ts verify-world.mjs
git commit -m "feat: build office floor plan"
```

### Task 3: Engine rewrite — movement and idle characters

**Files:**
- Modify: `app/game/engine.ts`
- Modify: `verify-combat.mjs` → replaced by `verify-movement.mjs`
- Modify: `package.json`
- Delete: `app/game/enemy.ts`, `app/game/weapon.ts`

**Interfaces:**
- Consumes `createCharacter` from `./character` and `createEnvironment` from `./environment`.
- `Game.configure` keeps the graphics preset path but drops the rain-count call.
- The `Snapshot` type shrinks to `{ mode, fps, player }` plus minimal menu state.

- [ ] **Step 1: Strip combat from engine.ts**

Apply these removals to `engine.ts`:

1. Delete `weapon`, `enemy`, and `weapon.ts` imports; keep `createEnvironment`, `createCharacter`, and `graphics`.
2. Replace the `Snapshot` type with:

```ts
export type Snapshot = {
  mode: 'menu' | 'playing' | 'paused';
  fps: number;
  player: { x: number; z: number };
};
```

3. Remove the `Actor` type, `Particle` type, `Soundscape` combat methods (`shot`, `hit`, `reload`), the `weapon`/`enemy` fields, `shoot`, `reload`, `damage`, `tracer`, `spawnParticle`, `addActors` (combat version), and the extraction/death logic.
4. Replace `addActors` with `addCharacters` that places one idle character per room:

```ts
addCharacters() {
  this.characters = this.env.spawnPoints.map((p, i) =>
    createCharacter(THREE, this.scene, p.x, p.z, i * 1.713),
  );
}
```

5. In `animate`, replace the actor update loop with idle character updates:

```ts
for (const c of this.characters) c.update(this.elapsed);
```

6. In `configure`, remove the `this.env.setRainCount(profile.rainCount)` line; keep pixel ratio, shadow-map, and bloom application plus `this.env.setShadowMapSize`.

7. Keep movement (`updatePlayer`), collision (`blocked`/`move`), camera, pointer lock, resize, and the graphics preset logic. Remove sprint/aim health recovery only where it ties to combat; keep WASD + mouse + Shift sprint.

- [ ] **Step 2: Replace the combat check with a movement check**

Delete `verify-combat.mjs` and create `verify-movement.mjs`:

```js
import fs from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import assert from 'node:assert/strict';

const source = await fs.readFile('./app/game/engine.ts', 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
await fs.writeFile('./.verify-engine.mjs', outputText
  .replaceAll("'./environment'", "'./app/game/environment.ts'")
  .replaceAll("'./character'", "'./app/game/character.ts'")
  .replaceAll("'./graphics'", "'./app/game/graphics.ts'"));
const { Game } = await import('./.verify-engine.mjs');
globalThis.document = { pointerLockElement: null };

function fixture() {
  const g = Object.create(Game.prototype);
  Object.assign(g, {
    camera: new THREE.PerspectiveCamera(68, 1, 0.05, 200),
    ray: new THREE.Raycaster(),
    scene: new THREE.Scene(),
    world: [],
    env: { colliders: [{ minX: -1, maxX: 1, minZ: -3, maxZ: -2, maxY: 1.07 }] },
    state: { mode: 'playing' },
    keys: new Set(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    elapsed: 0,
    feetY: 0,
    vertical: 0,
    aiming: false,
    sprinting: false,
    firing: false,
    reloadClock: 0,
    stepClock: 1,
    liveTime: 10,
    lastDamage: 0,
  });
  g.camera.position.set(0, 1.7, 0);
  g.camera.rotation.order = 'YXZ';
  g.ray.camera = g.camera;
  return g;
}

let g = fixture();
assert(g.blocked(0, -2.5, 0.32, 0), 'wall blocks movement');
assert(!g.blocked(0, -2.5, 0.32, 1.1), 'walking over low cover is allowed');
g.camera.position.set(0, 1.7, 0);
g.move(g.camera.position, 0, -10);
assert(g.camera.position.z > -1.7, 'long movement does not tunnel through a wall');
g.camera.position.set(0, 2.8, -2.5);
g.feetY = 1.1;
g.vertical = -1;
g.updatePlayer(0.05);
assert.equal(g.feetY, 1.07, 'land on low cover');
assert.equal(g.vertical, 0);
await fs.unlink('./.verify-engine.mjs');
console.log('PASS: collision, swept movement, low-cover landing.');
```

Update `package.json` so `npm test` runs `verify-world.mjs`, `verify-movement.mjs`, and `verify-graphics.mjs` (remove `verify-combat.mjs`).

- [ ] **Step 3: Run the full suite**

Run: `npm test`

Expected: all three checks pass.

- [ ] **Step 4: Commit the engine rewrite**

```sh
git add app/game/engine.ts verify-movement.mjs package.json
git rm app/game/enemy.ts app/game/weapon.ts
git commit -m "feat: replace combat with office movement and idle characters"
```

### Task 4: Simplify the interface

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes the shrunk `Snapshot`. Removes the military HUD and weapon references.

- [ ] **Step 1: Remove the combat HUD from page.tsx**

Delete the compass, objective, reticle, reload notice, health/minimap, ammo, and extraction-progress blocks. Keep the topbar (retitled), the scene host, the vignette, fullscreen toggle, and the settings panel (sensitivity, audio, cinematic, graphics presets). Replace the military menu copy with an office entry:

```tsx
<button className="deploy-button" onClick={start} disabled={!ready || !!error}>
  {state.mode === 'paused' ? 'CONTINUAR' : ready ? 'ENTRAR NO ESCRITÓRIO' : 'INICIALIZANDO'}
  <ArrowUpRight size={22} />
</button>
```

Remove `Snapshot` fields no longer present (`health`, `ammo`, etc.) from `initial` and any render references.

- [ ] **Step 2: Remove dead HUD styles from globals.css**

Delete the `.compass`, `.objective`, `.reticle`, `.ammo`, `.health-track`, `.mini-map`, `.extract-progress`, `.reload-notice`, and `.combat-notice` rules that no longer have markup. Keep `.graphics-setting`, `.settings-panel`, `.topbar`, `.menu-shade`, and the base layout.

- [ ] **Step 3: Run the full verification set**

Run:

```sh
npm test
npm run build
npm run lint
```

Expected: all commands exit successfully.

- [ ] **Step 4: Manually verify the walkthrough**

Run: `npm run dev`

Confirm the menu enters the office, the corridor has twelve rooms (six per side), each room shows one idle character, and WASD/mouse/Shift walk and run with wall collision. Confirm no weapon, reticle, ammo, or combat text appears.

- [ ] **Step 5: Commit the interface**

```sh
git add app/page.tsx app/globals.css
git commit -m "feat: simplify interface for office exploration"
```

## Self-Review

- Spec coverage: office corridor with twelve rooms (Task 2), one idle character per room (Tasks 1 and 3), movement/collision reuse (Task 3), no weapons or combat (Tasks 3 and 4), minimal menu (Task 4), verification commands (Tasks 2-4).
- Placeholder scan: no `TODO`/`TBD`; every step shows the code or the exact removal.
- Type consistency: `createCharacter(THREE, scene, x, z, offset)` returns `{ group, legs, arms, torso, head, update }`; `env.spawnPoints` is `{ x, z }[]` consumed by `addCharacters`; the shrunk `Snapshot` is `{ mode, fps, player }` consumed by `page.tsx`.
- Deliberate limitation: characters are static idle models with no AI or dialogue; furniture and interactions are intentionally out of scope for this iteration.
