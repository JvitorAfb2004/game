# Wooden Doors, Frosted Glass and Switch Interaction — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wooden doors, frosted glass, lower brightness, fewer active lights, a center reticle, and an E-to-toggle room light switch.

**Architecture:** `createEnvironment` returns `rooms` with each room's point light, LED mesh, and switch position. The engine enables room lights by proximity, raycasts/aims for the switch, toggles it with E, and publishes a prompt in the snapshot. The page renders the reticle and prompt.

**Tech Stack:** React 19, TypeScript, Three.js 0.180, Vite, Node assertions.

## Global Constraints

- Wooden door (no glass leaf), frosted glass panels, no scene environment/IBL.
- Lower global brightness; at most a few active lights at once.
- Center reticle while playing; bottom center prompt when targeting a switch.
- Keep movement/collision, graphics presets, instancing, and UTF-8.

---

### Task 1: Environment — wooden door, frosted glass, per-room switch and light

**Files:**
- Modify: `app/game/environment.ts`
- Modify: `verify-world.mjs`

**Interfaces:**
- `createEnvironment` also returns `rooms: { light, led, on, side, x, z, switch: { x, y, z } }[]` (12 entries).
- `switch` is the world position used for aim/prompt; `led` toggles emissive.

- [ ] **Step 1: Wood and frosted glass materials**

Replace the glass material with frosted glass and add wood and handle materials:

```ts
const glassMat = new THREE.MeshStandardMaterial({
  color: 0xdfe8e6,
  transparent: true,
  opacity: 0.55,
  roughness: 0.65,
  metalness: 0,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.85 });
const woodEdgeMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.8 });
const handleMat = new THREE.MeshStandardMaterial({ color: 0xc8c2b4, roughness: 0.35, metalness: 0.85 });
```

Remove the LED-from-instancing: keep `ledMat` but each room's panel is a
separate mesh so its emissive can toggle.

- [ ] **Step 2: Wooden door leaf and handle**

Replace the glass leaf with a wooden leaf and add a handle:

```ts
const leaf = new THREE.Mesh(unitBox, woodMat);
leaf.scale.set(0.06, panelH, doorHalf * 2);
leaf.position.set(0, panelH / 2, doorHalf);
const leafEdge = new THREE.Mesh(unitBox, woodEdgeMat);
leafEdge.scale.set(0.08, 0.09, doorHalf * 2);
leafEdge.position.set(0, 0.05, doorHalf);
const handle = new THREE.Mesh(unitBox, handleMat);
handle.scale.set(0.03, 0.05, 0.16);
handle.position.set(-side * 0.06, 1.05, doorHalf * 2 - 0.2);
pivot.add(leaf, leafEdge, handle);
```

- [ ] **Step 3: Per-room switch, light, and LED**

Inside the per-room loop, add a switch on the lateral wall near the door, a
room point light, and a separate LED panel:

```ts
const sw = new THREE.Mesh(unitBox, switchMat);
sw.scale.set(0.09, 0.14, 0.05);
const swZ = z0 + 0.22;
sw.position.set(side * 2.4, 1.25, swZ);
scene.add(sw);

const light = new THREE.PointLight(0xffe9c8, 7, 9, 2);
light.position.set(side * 4.25, ceilingHeight - 0.3, center);
light.visible = false;
scene.add(light);

const led = new THREE.Mesh(unitBox, ledMat);
led.scale.set(0.9, 0.05, 1.8);
led.position.set(side * 4.25, ceilingHeight - 0.03, center);
scene.add(led);

rooms.push({
  light,
  led,
  on: true,
  side,
  x: side * 4.25,
  z: center,
  switch: { x: side * 2.4, y: 1.25, z: swZ },
});
```

Declare `const rooms: ... = [];` and keep `ledMat` out of the instanced batches
(remove the room/corridor LED lines from the batch section; keep corridor LED
panels as simple meshes or batch them separately — corridor panels can stay
instanced with a separate `ledMat` since they never toggle).

- [ ] **Step 4: Lower the global fill**

Reduce the fill lights:

```ts
scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a4, 0.7));
scene.add(new THREE.AmbientLight(0xffffff, 0.12));
```

Keep two dim corridor point lights and the directional light.

- [ ] **Step 5: Extend verify-world.mjs**

```js
assert.equal(env.rooms.length, 12, 'twelve switchable rooms');
for (const r of env.rooms) assert(r.switch && r.light && r.led, 'room has light and switch');
```

- [ ] **Step 6: Run and commit**

Run: `npm test`, then `git add app/game/environment.ts verify-world.mjs && git commit -m "feat: wooden doors, frosted glass, per-room lights and switches"`.

### Task 2: Engine — proximity lights, switch aim, E toggle

**Files:**
- Modify: `app/game/engine.ts`
- Modify: `verify-movement.mjs`

**Interfaces:**
- `Snapshot` gains `prompt: string`.
- `Game` gains `updateRooms(dt)` and `toggleTargetRoom()`.

- [ ] **Step 1: Snapshot and state**

Add `prompt: string` to `Snapshot`, initialize `prompt: ''`, and keep it in
`emit`.

- [ ] **Step 2: Proximity lights and aim**

```ts
updateRooms() {
  const forward = new THREE.Vector3();
  this.camera.getWorldDirection(forward);
  let prompt = '';
  for (const r of this.env.rooms) {
    const dist = Math.hypot(this.camera.position.x - r.x, this.camera.position.z - r.z);
    r.light.visible = r.on && dist < 6;
    const toSwitch = new THREE.Vector3(
      r.switch.x - this.camera.position.x,
      r.switch.y - this.camera.position.y,
      r.switch.z - this.camera.position.z,
    );
    const d = toSwitch.length();
    if (d < 3 && toSwitch.normalize().dot(forward) > 0.97) {
      this.target = r;
      prompt = `PRESSIONE E PARA ${r.on ? 'DESLIGAR' : 'LIGAR'} A LUZ`;
    }
  }
  this.state.prompt = prompt;
}
toggleTargetRoom() {
  if (!this.target) return;
  const r = this.target;
  r.on = !r.on;
  r.light.visible = r.on;
  (r.led.material as THREE.MeshStandardMaterial).emissiveIntensity = r.on ? 1.6 : 0;
  this.sound.noise(0.05, 0.1, 900);
}
```

Add `target: ... | null = null;` field. Reset `this.target = null` at the top of
`updateRooms`.

- [ ] **Step 3: Hook E and the frame loop**

In `bind`, on `keydown` add:

```ts
if (e.code === 'KeyE' && this.state.mode === 'playing') this.toggleTargetRoom();
```

In `animate`, call `this.updateRooms();` after `this.updateDoors(dt);`.

- [ ] **Step 4: verify-movement.mjs**

Add a toggle check with a stub room:

```js
g.env = {
  colliders: [],
  doors: [],
  rooms: [{ on: true, light: { visible: false }, led: { material: {} }, switch: { x: 0, y: 1.7, z: -2 }, x: 0, z: -2, side: 1 }],
};
g.camera.position.set(0, 1.7, 0);
g.camera.rotation.set(0, 0, 0);
g.camera.updateMatrixWorld(true);
g.updateRooms();
assert(g.state.prompt.length > 0, 'prompt shown when aiming at the switch');
g.toggleTargetRoom();
assert.equal(g.env.rooms[0].on, false, 'E toggles the room light off');
```

- [ ] **Step 5: Run and commit**

Run: `npm test`, then commit `feat: toggle room lights with E`.

### Task 3: UI — reticle and prompt

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Reticle and prompt markup**

While playing, render:

```tsx
<div className="reticle" aria-hidden="true" />
{active && state.prompt && (
  <div className="interact-toast" role="status">{state.prompt}</div>
)}
```

- [ ] **Step 2: Styles**

```css
.reticle{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#eef4e0;box-shadow:0 0 0 1px #10181788,0 0 6px #0008;z-index:6;pointer-events:none}
.interact-toast{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);z-index:6;background:#0b171dee;border:1px solid #b9c7bb44;color:#e6eecb;font:10px monospace;letter-spacing:1.5px;padding:9px 16px;border-radius:2px}
```

- [ ] **Step 3: Verify and commit**

Run: `npm test && npm run build && npm run lint`, then commit
`feat: add center reticle and interaction prompt`.

## Self-Review

- Spec coverage: wooden door (Task 1), frosted glass and no IBL (Task 1), lower brightness and proximity lights (Tasks 1-2), reticle and prompt (Task 3), E toggle (Task 2), verification (Tasks 1-3).
- Placeholder scan: no `TODO`/`TBD`; code shown for every change.
- Type consistency: `env.rooms[]` fields match between environment and engine; `Snapshot.prompt` is string throughout.
- Deliberate limitation: room lights do not cast shadows; add later if wanted. Dynamic light counts recompile a shader once per count and are then cached.
