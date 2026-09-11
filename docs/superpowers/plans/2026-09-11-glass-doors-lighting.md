# Glass Facade and Lighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close each office room with a reflective glass facade and a real hinged door that swings inward on approach, and light the ceiling.

**Architecture:** Extend `createEnvironment` to build glass facades, door pivots, and ceiling lights, and return the door pivots. The engine animates each door pivot by player proximity. Movement and collision are unchanged.

**Tech Stack:** React 19, TypeScript, Three.js 0.180, Vite, Node assertion checks.

## Global Constraints

- Twelve facades, one hinged door each.
- Door swings inward on approach (about 3 units) and closes on leaving.
- Glass is transparent with reflections; transmission is not used.
- Glass panels collide; the door opening is passable.
- Keep graphics presets and performance work; keep UTF-8 text.

---

### Task 1: Build glass facades, doors, and lights

**Files:**
- Modify: `app/game/environment.ts`
- Modify: `verify-world.mjs`

**Interfaces:**
- `createEnvironment(THREE, scene)` also returns `doors: { group: ThreeType.Object3D; x: number; z: number; side: number }[]`.
- `group` is the pivot placed on the door jamb; rotating `group.rotation.y` opens the door.

- [ ] **Step 1: Add the environment map and glass material**

Import the room environment and generate a PMREM environment:

```ts
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
```

Inside `createEnvironment`, after the scene is available:

```ts
const pmrem = new THREE.PMREMGenerator(THREE as unknown as never);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
```

Add the glass and frame materials:

```ts
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xbfe3df,
  transparent: true,
  opacity: 0.16,
  roughness: 0.04,
  metalness: 0,
  envMapIntensity: 1.4,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const frameMat = new THREE.MeshStandardMaterial({
  color: 0x24282c,
  roughness: 0.45,
  metalness: 0.6,
});
```

- [ ] **Step 2: Build the facade and door per room**

Inside the existing per-room loop, replace the open entrance with a facade. The facade sits at `x = side * halfCorridor`, spanning the room width with a central 1.2-wide door opening:

```ts
const doorHalf = 0.6;
const panelH = 2.4;
const xFace = side * halfCorridor;
// side glass panels
addPanel(xFace, center - (doorHalf + (roomWidth / 2 - doorHalf)) / 2, roomWidth / 2 - doorHalf);
addPanel(xFace, center + (doorHalf + (roomWidth / 2 - doorHalf)) / 2, roomWidth / 2 - doorHalf);
// header above the door
addBox(xFace, panelH + (ceilingHeight - panelH) / 2, center, 0.12, ceilingHeight - panelH, doorHalf * 2);
// jambs and posts
addBox(xFace, panelH / 2, center - doorHalf, 0.12, panelH, 0.08);
addBox(xFace, panelH / 2, center + doorHalf, 0.12, panelH, 0.08);
addBox(xFace, panelH / 2, center - roomWidth / 2 + 0.04, 0.12, panelH, 0.08);
addBox(xFace, panelH / 2, center + roomWidth / 2 - 0.04, 0.12, panelH, 0.08);
// door pivot and leaf
const pivot = new THREE.Group();
pivot.position.set(xFace, 0, center - doorHalf);
const leaf = new THREE.Mesh(
  new THREE.BoxGeometry(0.05, panelH, doorHalf * 2),
  glassMat,
);
leaf.position.set(0, panelH / 2, doorHalf);
const leafFrame = new THREE.Mesh(
  new THREE.BoxGeometry(0.07, 0.08, doorHalf * 2),
  frameMat,
);
leafFrame.position.set(0, panelH - 0.05, doorHalf);
pivot.add(leaf, leafFrame);
scene.add(pivot);
doors.push({ group: pivot, x: xFace, z: center, side });
```

Add the `addPanel` and `addBox` helpers that create a mesh and push a collider for the glass panels only (the door opening must stay clear):

```ts
const addPanel = (x: number, z: number, w: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, panelH, w), glassMat);
  mesh.position.set(x, panelH / 2, z);
  scene.add(mesh);
  collider(x, z, 0.12, w);
};
```

Declare `const doors: { group: ThreeType.Object3D; x: number; z: number; side: number }[] = [];` near `colliders` and include `doors` in the return object.

- [ ] **Step 3: Add ceiling LED panels and lights**

Add emissive ceiling panels and lighting:

```ts
const ledMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xffffff,
  emissiveIntensity: 1.6,
});
const panel = (x: number, z: number, w: number, d: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), ledMat);
  mesh.position.set(x, ceilingHeight - 0.03, z);
  scene.add(mesh);
};
for (const center of roomCenters) {
  panel(3.4, center, 1.2, 2.4);
  panel(-3.4, center, 1.2, 2.4);
}
for (let z = 10; z > -34; z -= 11) panel(0, z, 1.4, 1.4);
```

Increase the fill lighting and add a few corridor point lights:

```ts
scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a4, 2.2));
scene.add(new THREE.AmbientLight(0xffffff, 0.45));
for (const z of [8, -6, -20]) {
  const p = new THREE.PointLight(0xfff2e0, 12, 16, 2);
  p.position.set(0, ceilingHeight - 0.2, z);
  scene.add(p);
}
```

- [ ] **Step 4: Extend verify-world.mjs**

Add facade and door assertions:

```js
assert.equal(env.doors.length, 12, 'twelve hinged doors');
for (const p of env.spawnPoints) {
  const side = Math.sign(p.x);
  assert(!blocked(side * 1.6, p.z), `door opening passable at ${p.x},${p.z}`);
  assert(blocked(side * 1.5, p.z + 2), `glass blocks beside the door at ${p.x},${p.z}`);
}
```

- [ ] **Step 5: Run the checks**

Run: `npm test`

Expected: office, movement, and graphics checks pass, including twelve doors.

- [ ] **Step 6: Commit**

```sh
git add app/game/environment.ts verify-world.mjs
git commit -m "feat: add glass facades, doors, and ceiling lighting"
```

### Task 2: Animate doors by proximity

**Files:**
- Modify: `app/game/engine.ts`
- Modify: `verify-movement.mjs`

**Interfaces:**
- Consumes `env.doors`.
- Each frame, lerp `door.group.rotation.y` toward `door.side * 1.55` when the player is within 3 units, else `0`.

- [ ] **Step 1: Animate doors in the frame loop**

Add a method and call it from `animate`:

```ts
updateDoors(dt: number) {
  for (const d of this.env.doors) {
    const dist = Math.hypot(
      this.camera.position.x - d.x,
      this.camera.position.z - d.z,
    );
    const target = dist < 3 ? d.side * 1.55 : 0;
    d.group.rotation.y += (target - d.group.rotation.y) * (1 - Math.exp(-dt * 9));
  }
}
```

Call `this.updateDoors(dt);` in `animate` after `this.env.update(...)`.

- [ ] **Step 2: Extend verify-movement.mjs**

Add a door animation check using a stub environment:

```js
g.env = { colliders: [], doors: [{ group: new THREE.Object3D(), x: 0, z: 0, side: 1 }] };
g.camera.position.set(0, 1.7, 0);
g.updateDoors(0.05);
assert(g.env.doors[0].group.rotation.y > 0, 'door opens when the player is near');
g.camera.position.set(0, 1.7, 10);
g.updateDoors(0.5);
assert(g.env.doors[0].group.rotation.y < 0.05, 'door closes when the player is away');
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`

Expected: all checks pass.

- [ ] **Step 4: Commit**

```sh
git add app/game/engine.ts verify-movement.mjs
git commit -m "feat: open doors by proximity"
```

### Task 3: Full verification

- [ ] **Step 1: Run the full set**

Run:

```sh
npm test
npm run build
npm run lint
```

Expected: all commands exit successfully.

- [ ] **Step 2: Manually verify**

Run: `npm run dev`

Confirm the corridor has glass facades with dark frames, doors swing inward as
you approach and close as you leave, glass blocks you, the door opening lets you
through, and the ceiling is present and lit.

## Self-Review

- Spec coverage: facades and doors (Task 1), inward proximity animation (Task 2), glass material with reflections and no transmission (Task 1), ceiling and lighting (Task 1), collision and passability (Task 1), verification (Tasks 1-3).
- Placeholder scan: no `TODO`/`TBD`; code is shown for every change.
- Type consistency: `env.doors` is `{ group, x, z, side }[]`, consumed by `updateDoors`; `door.side` sets the inward direction.
- Deliberate limitation: no door sound and no door collider (the opening stays clear); add later if wanted.
