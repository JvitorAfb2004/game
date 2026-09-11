# XP Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove cinematic/bloom and room characters; add one industrial desk with a notebook per room; left-clicking an aimed notebook opens a fullscreen Windows XP-style desktop, ESC returns to the game.

**Architecture:** `createEnvironment` batches desks/notebooks into the existing instanced meshes and returns notebook targets. The engine reuses the switch-aim pattern, adds a `desktop` mode plus flag, and releases pointer lock on entry. `page.tsx` renders a CSS-only XP overlay. Verification scripts assert budgets and the new interaction.

**Tech Stack:** React 19, TypeScript, Three.js 0.180, Vite, Node assertion checks.

## Global Constraints

- No `cinematic`, `bloom`, or `UnrealBloomPass` references remain in `app/`.
- No character renders in any room; 12 desks with notebooks do.
- Aiming at a notebook shows the access prompt; left-click opens the XP desktop fullscreen; ESC returns to the game.
- XP overlay shows wallpaper, icons, taskbar, working Start menu, and clock.
- `npm test`, `npm run build`, and `npm run lint` pass.
- No `�` replacement characters are introduced.

---

### Task 1: Remove cinematic and bloom

**Files:**
- Modify: `app/game/engine.ts`
- Modify: `app/game/graphics.ts`
- Modify: `app/page.tsx`
- Modify: `verify-graphics.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `configure(o: { graphics: GraphicsPreset; muted: boolean; sensitivity: number })` with no cinematic parameter; `GraphicsProfile` with no `bloomStrength`.

- [ ] **Step 1: Strip bloom from the engine**

In `app/game/engine.ts`, delete the import line:

```ts
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
```

Delete the field declaration:

```ts
  bloom: UnrealBloomPass;
```

Delete the two composer lines:

```ts
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.24, 0.5, 1.08);
    this.composer.addPass(this.bloom);
```

Delete the `cinematic` field:

```ts
  cinematic = true;
```

Replace the whole `configure` method with:

```ts
  configure(o: {
    graphics: GraphicsPreset;
    muted: boolean;
    sensitivity: number;
  }) {
    const profile = getGraphicsProfile(o.graphics);
    this.sound.setMute(o.muted);
    this.sensitivity = o.sensitivity;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, profile.pixelRatio));
    this.renderer.shadowMap.enabled = profile.shadows;
    this.env.setShadowMapSize(profile.shadowMapSize);
    this.resize();
  }
```

- [ ] **Step 2: Strip bloom from graphics profiles**

In `app/game/graphics.ts`, remove `bloomStrength: number;` from the type and
remove the three `bloomStrength` lines from the low/medium/high profiles.

- [ ] **Step 3: Strip cinematic from the page**

In `app/page.tsx`, delete the state line:

```tsx
    [cinematic, setCinematic] = useState(true),
```

Replace the configure effect with:

```tsx
  useEffect(() => {
    engine.current?.configure({ muted, sensitivity, graphics });
  }, [muted, sensitivity, graphics, ready]);
```

Delete the whole cinematic settings row:

```tsx
          <div className="setting-row">
            <label htmlFor="cinematic">
              Cinematic effects<small>Bloom, lighting and film treatment</small>
            </label>
            <Switch
              id="cinematic"
              checked={cinematic}
              onCheckedChange={setCinematic}
            />
          </div>
```

- [ ] **Step 4: Update the graphics check**

In `verify-graphics.mjs`, delete line 15:

```js
assert.equal(getGraphicsProfile('medium').bloomStrength, medium.bloomStrength);
```

- [ ] **Step 5: Verify removal**

Run:

```sh
npm test
npx oxlint 2>&1 | head -5
grep -r "cinematic\|bloom\|UnrealBloom" app/ || echo "clean"
```

Expected: tests pass, lint clean, grep prints `clean`.

- [ ] **Step 6: Commit**

```sh
git add app/game/engine.ts app/game/graphics.ts app/page.tsx verify-graphics.mjs
git commit -m "feat: remove cinematic and bloom path"
```

### Task 2: Swap characters for desks with notebooks

**Files:**
- Modify: `app/game/engine.ts`
- Modify: `app/game/environment.ts`
- Modify: `verify-world.mjs`
- Delete: `app/game/character.ts`

**Interfaces:**
- Consumes: `spawnPoints` stays (room centers) for desk placement reference.
- Produces: `notebooks: { x: number; y: number; z: number }[]` (12 screen positions) from `createEnvironment`; desk colliders in `env.colliders`.

- [ ] **Step 1: Add desks and notebooks to the environment**

In `app/game/environment.ts`, inside the per-room loop (where `roomX` equals
`side * (halfCorridor + roomDepth / 2)` and `center` is the room center), add
after the existing `rooms.push({...})` block:

```ts
      // Industrial desk with a notebook, facing the door.
      const deskX = side * (halfCorridor + roomDepth / 2);
      box(woodMat, deskX, 0.72, center, 1.6, 0.06, 0.9);
      box(frameMat, deskX - 0.7, 0.36, center - 0.35, 0.08, 0.72, 0.08);
      box(frameMat, deskX + 0.7, 0.36, center - 0.35, 0.08, 0.72, 0.08);
      box(frameMat, deskX - 0.7, 0.36, center + 0.35, 0.08, 0.72, 0.08);
      box(frameMat, deskX + 0.7, 0.36, center + 0.35, 0.08, 0.72, 0.08);
      box(frameMat, deskX, 0.8, center, 0.42, 0.04, 0.3);
      box(ledMat, deskX + side * 0.15, 0.99, center, 0.03, 0.34, 0.42);
      collider(deskX, center, 1.7, 1.0);
      notebooks.push({ x: deskX + side * 0.15, y: 0.99, z: center });
```

Declare the list next to the `doors`/`rooms` declarations:

```ts
  const notebooks: { x: number; y: number; z: number }[] = [];
```

Include `notebooks` in the returned object.

- [ ] **Step 2: Remove characters from the engine**

In `app/game/engine.ts`, delete the import:

```ts
import { createCharacter } from './character';
```

Delete the field:

```ts
  characters: ReturnType<typeof createCharacter>[] = [];
```

Delete the whole `addCharacters` method (the one mapping `spawnPoints` to
`createCharacter`) and its constructor call:

```ts
    this.addCharacters();
```

Delete the per-frame update line:

```ts
    for (const c of this.characters) c.update(this.elapsed);
```

- [ ] **Step 3: Delete character.ts and rewrite the world check**

Run:

```sh
git rm app/game/character.ts
```

In `verify-world.mjs`, delete the character import, the `document` canvas mock,
and the character budget test. Add desk assertions after the door assertions:

```js
assert.equal(env.notebooks.length, 12, 'twelve notebooks');
for (const n of env.notebooks)
  assert(n.y > 0.8 && n.y < 1.2, 'notebook screen at desk height');
for (const p of env.spawnPoints)
  assert(blocked(p.x, p.z), `desk blocks room center ${p.x},${p.z}`);
```

- [ ] **Step 4: Run the suite**

Run:

```sh
npm test
npm run build
npm run lint
```

Expected: all commands exit successfully.

- [ ] **Step 5: Commit**

```sh
git add app/game/engine.ts app/game/environment.ts verify-world.mjs
git commit -m "feat: swap room characters for desks with notebooks"
```

### Task 3: Notebook aim, click, and desktop mode

**Files:**
- Modify: `app/game/engine.ts`
- Modify: `verify-movement.mjs`

**Interfaces:**
- Consumes: `env.notebooks: { x: number; y: number; z: number }[]`.
- Produces: `Snapshot.desktop: boolean`; `enterDesktop()` / `exitDesktop()`
  methods; notebook prompt text.

- [ ] **Step 1: Extend the snapshot and modes**

In `app/game/engine.ts`, change the mode union to include desktop:

```ts
export type Snapshot = {
  mode: 'menu' | 'playing' | 'paused' | 'desktop';
  fps: number;
  player: { x: number; z: number };
  prompt: string;
  desktop: boolean;
};
```

Add the field next to `target`:

```ts
  notebookTarget: { x: number; y: number; z: number } | null = null;
```

Add `desktop: false` to the initial `state` object, to the `reset()` state
object, and to the `emit()` payload. In `start()`, add
`this.state.desktop = false;` before `this.emit();`.

- [ ] **Step 2: Aim notebooks and handle clicks**

In `updateRooms()`, after the room loop and before the corridor-lights loop,
add:

```ts
    this.notebookTarget = null;
    for (const n of this.env.notebooks) {
      const toNb = new THREE.Vector3(
        n.x - this.camera.position.x,
        n.y - this.camera.position.y,
        n.z - this.camera.position.z,
      );
      const d = toNb.length();
      if (d < 3 && toNb.normalize().dot(forward) > 0.97) {
        this.notebookTarget = n;
        prompt = 'CLIQUE PARA ACESSAR O NOTEBOOK';
      }
    }
```

Add the two methods after `toggleTargetRoom()`:

```ts
  enterDesktop() {
    this.state.mode = 'desktop';
    this.state.desktop = true;
    this.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    this.emit();
  }
  exitDesktop() {
    if (this.state.mode !== 'desktop') return;
    this.state.mode = 'paused';
    this.state.desktop = false;
    this.keys.clear();
    this.emit();
  }
```

Replace the mousedown handler with:

```ts
    this.listen('mousedown', (e) => {
      this.lastMouse = { x: e.clientX, y: e.clientY };
      if (e.button === 0 && this.state.mode === 'playing' && this.notebookTarget)
        this.enterDesktop();
    });
```

Add desktop-exit priority at the top of the keydown handler, before
`this.keys.add(e.code);`:

```ts
      if (e.code === 'Escape' && this.state.mode === 'desktop') {
        this.exitDesktop();
        return;
      }
```

- [ ] **Step 3: Extend the movement check**

In `verify-movement.mjs`, the fixture `env` objects need `notebooks: []`
wherever `doors: []` appears, so `updateRooms()` never sees `undefined`.
Append before the `unlink` line:

```js
g.env = {
  colliders: [],
  doors: [],
  corridorLights: [],
  rooms: [],
  notebooks: [{ x: 0, y: 1.0, z: -2 }],
};
g.camera.position.set(0, 1.7, 0);
g.camera.rotation.set(0, 0, 0);
g.camera.updateMatrixWorld(true);
g.updateRooms();
assert(g.notebookTarget, 'notebook targeted when aimed at');
assert.equal(g.state.prompt, 'CLIQUE PARA ACESSAR O NOTEBOOK', 'notebook prompt shown');
g.enterDesktop();
assert.equal(g.state.desktop, true, 'desktop opens on click');
assert.equal(g.state.mode, 'desktop', 'mode switches to desktop');
g.exitDesktop();
assert.equal(g.state.desktop, false, 'desktop closes');
assert.equal(g.state.mode, 'paused', 'exit lands on pause menu');
await fs.unlink('./.verify-engine.mjs');
```

Note: the existing `unlink` + `console.log('PASS: ...')` lines stay; insert the
block right before them and extend the PASS text with `notebook desktop`.

- [ ] **Step 4: Run the suite**

Run:

```sh
npm test
npm run build
npm run lint
```

Expected: all commands exit successfully.

- [ ] **Step 5: Commit**

```sh
git add app/game/engine.ts verify-movement.mjs
git commit -m "feat: notebook aim, click to desktop mode, ESC exits"
```

### Task 4: XP overlay

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `state.desktop: boolean`; `engine.current?.exitDesktop()` for the
  menu "Encerrar sessão" item.

- [ ] **Step 1: Overlay state and markup**

In `app/page.tsx`, add next to the other `useState` lines:

```tsx
    [startOpen, setStartOpen] = useState(false),
    [clock, setClock] = useState('');
```

Add an effect that ticks the clock only while the desktop is open:

```tsx
  useEffect(() => {
    if (!state.desktop) return;
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    tick();
    const id = window.setInterval(tick, 10000);
    return () => window.clearInterval(id);
  }, [state.desktop]);
```

Hide the mission menu while the desktop is open by changing its condition to
`{!active && !settings && !state.desktop && (`.

Render the overlay right after the toast block:

```tsx
      {state.desktop && (
        <div className="xp" role="dialog" aria-label="Área de trabalho">
          <div className="xp-icons">
            <button type="button">
              <span aria-hidden="true">🖥</span>Meu computador
            </button>
            <button type="button">
              <span aria-hidden="true">🗑</span>Lixeira
            </button>
            <button type="button">
              <span aria-hidden="true">🌐</span>Internet
            </button>
          </div>
          <div className="xp-taskbar">
            <button
              type="button"
              className="xp-start"
              onClick={() => setStartOpen(!startOpen)}
            >
              iniciar
            </button>
            {startOpen && (
              <div className="xp-menu">
                <button type="button">Programas</button>
                <button type="button">Documentos</button>
                <button
                  type="button"
                  onClick={() => {
                    setStartOpen(false);
                    engine.current?.exitDesktop();
                  }}
                >
                  Encerrar sessão
                </button>
              </div>
            )}
            <div className="xp-clock">{clock}</div>
          </div>
          <div className="xp-hint">ESC para voltar ao jogo</div>
        </div>
      )}
```

- [ ] **Step 2: Overlay styles**

Append to `app/globals.css`:

```css
.xp{position:absolute;inset:0;z-index:50;background:linear-gradient(#3a7bd5 0%,#5b9bd5 45%,#3d8b37 46%,#2f7a2c 100%);color:#fff;font-family:Tahoma,Arial,sans-serif;overflow:hidden}
.xp-icons{position:absolute;top:24px;left:24px;display:flex;flex-direction:column;gap:22px}
.xp-icons button{display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:0;color:#fff;font-size:12px;text-shadow:1px 1px 2px #000}
.xp-icons span{font-size:34px}
.xp-taskbar{position:absolute;left:0;right:0;bottom:0;height:44px;display:flex;align-items:stretch;background:linear-gradient(#3c81d6,#1f5fb8);border-top:2px solid #6ea8e8}
.xp-start{border:0;border-radius:0 18px 18px 0;background:linear-gradient(#5cb85c,#2f7a2c);color:#fff;font-style:italic;font-weight:700;font-size:18px;padding:0 34px 0 20px;cursor:pointer}
.xp-menu{position:absolute;left:4px;bottom:48px;width:220px;background:#f5f5f5;border:1px solid #1f5fb8;display:flex;flex-direction:column}
.xp-menu button{border:0;background:none;text-align:left;color:#111;font-size:14px;padding:10px 14px;cursor:pointer}
.xp-menu button:hover{background:#1f5fb8;color:#fff}
.xp-clock{margin-left:auto;display:flex;align-items:center;padding:0 18px;background:#1290e9;font-size:13px}
.xp-hint{position:absolute;top:12px;left:50%;transform:translateX(-50%);font-size:11px;letter-spacing:1px;background:#0009;padding:6px 12px;border-radius:2px}
```

- [ ] **Step 3: Verify everything**

Run:

```sh
npm test
npm run build
npm run lint
```

Expected: all commands exit successfully.

- [ ] **Step 4: Manual check and commit**

Run `npm run dev`: enter a room, aim at the notebook, confirm the prompt,
left-click, confirm the XP desktop covers the screen, open the Start menu,
check the clock, press ESC, confirm the pause menu returns. Then:

```sh
git add app/page.tsx app/globals.css
git commit -m "feat: add Windows XP desktop overlay"
```

## Self-Review

- Spec coverage: cinematic removal (Task 1), character removal (Task 2), desk plus notebook (Task 2), aim plus click plus desktop mode (Task 3), XP overlay with Start and clock (Task 4), verification everywhere.
- Placeholder scan: no `TODO`, `TBD`, or vague steps; every edit shows exact code.
- Type consistency: `notebooks: { x: number; y: number; z: number }[]` produced by the environment and consumed by the engine; `Snapshot.desktop: boolean` produced by the engine and consumed by the page; mode union gains `'desktop'` in both.
- Deliberate limitation: program windows are out of scope; exiting the desktop lands on the pause menu because pointer relock needs a fresh click.

```

## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `docs/superpowers/plans/<filename>.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review
