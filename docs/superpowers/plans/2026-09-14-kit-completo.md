# Kit Completo — Escritório Real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portas trancadas não abrem, luz clara apesar das texturas, móveis 3D reais com colisão sólida e personagens blocky escolhíveis/aleatórios — sem atravessar paredes/móveis.

**Architecture:** Manter `InstancedMesh` e AABB 2D leve; `engine.ts` trava `updateDoors`/`doorBlocked` via `lockedRooms`, `environment.ts` aplica texturas Kenney e carrega kit office/characters com fallback caixa/humanóide, `movement.ts` replica colisão no servidor, `figures.ts` mapeia 4 variantes para FBX.

**Tech Stack:** Three.js 0.180, FBXLoader, GLTFLoader + DRACOLoader, Fastify, Postgres (rooms, users.character), Zod, Vite.

## Global Constraints
- Node >=22.13.0, Three 0.180, textures Kenney CC0 em public/tex/* e public/characters/* já presentes
- `ownedRooms` default ['W1','E1']; salas alugáveis ['W2','W3','E2','E3']; `ROOM_RENT entry 6000 monthly 1500`
- 35 testes de company devem permanecer verdes; `vite build` e `tsc -p server/tsconfig.json` sem erros
- Fallback caixa/humanóide se GLB/FBX 404; sem migração de save além de `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`

---

### Task 1: Portas trancadas — não animar e não atravessar

**Files:**
- Modify: `app/game/engine.ts:758-820` (updateDoors, doorBlocked, setLockedRooms)
- Modify: `app/game/environment.ts:doors` (roomId já existe)
- Test: `verify-world.mjs` + manual: mirar porta trancada

**Interfaces:**
- Consumes: `company.ownedRooms` → `setLockedRooms(ids)` → `lockedRooms:Set` + `serverPlaques:Set`
- Produces: `doorBlocked()` true para trancadas, `updateDoors()` trava target=0

- [ ] **Step 1: Adicionar early return para trancadas em updateDoors**

```ts
// app/game/engine.ts updateDoors
for (const d of this.env.doors) {
  if (d.roomId && this.lockedRooms.has(d.roomId)) { d.group.rotation.y += (0 - d.group.rotation.y) * k; continue; }
  // ... existing logic for normal doors
}
```

- [ ] **Step 2: Adicionar early return para trancadas em doorBlocked**

```ts
doorBlocked(x,z,r,feet){
  for(const d of this.env.doors){
    if(d.roomId && this.lockedRooms.has(d.roomId)){
      if(d.plane==='z' ? Math.abs(z-d.z)<r+0.08 && Math.abs(x-d.x)<d.half+r : Math.abs(x-d.x)<r+0.08 && Math.abs(z-d.z)<d.half+r) return true;
      continue;
    }
    if(feet>0.5) continue; if(Math.abs(d.group.rotation.y)>1.2) continue; // ...
  }
}
```

- [ ] **Step 3: Verificar prompt já existe em updateRooms (linha ~820) e placa “🔒 À VENDA” em setLockedRooms**

- [ ] **Step 4: Testar manual — alugar W2 no Empresa → porta abre; antes não abre nem pulando**

- [ ] **Step 5: Commit**

```bash
git add app/game/engine.ts
git commit -m "fix(doors): trancadas não animam nem deixam atravessar"
```

### Task 2: Luz — corrigir escuro das texturas

**Files:**
- Modify: `app/game/environment.ts:105-145` (applyTex, wallMat, corridorWallMat, floorMat, woodMat, lights)
- Test: screenshot antes/depois, `npm run build`

**Interfaces:**
- Consumes: `loader: TextureLoader`
- Produces: `wallMat.map`, `floorMat.map` com repeat, `PointLight.intensity/distance`

- [ ] **Step 1: Em applyTex, setar color branca quando map presente**

```ts
const applyTex = (mat, url, repeat) => loader.load(url, t => {
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(repeat[0],repeat[1]); t.colorSpace=THREE.SRGBColorSpace;
  mat.map=t; mat.color.set(0xffffff); mat.needsUpdate=true;
});
applyTex(wallMat,'/tex/wall_brick_small_stone.png',[2,1]);
applyTex(corridorWallMat,'/tex/wall_timber_structure.png',[1.5,1]);
applyTex(floorMat,'/tex/floor_tiles_tan_small.png',[6,9]);
applyTex(woodMat,'/tex/door_wood.png',[1,1]);
```

- [ ] **Step 2: Aumentar luzes**

```ts
// corridor: intensity 9→11, copa 12→14, room 8→14 distance 18 decay 2
// Ambient 0.05→0.12, Hemisphere 0.26→0.32
scene.add(new THREE.AmbientLight(0xffffff,0.12));
```

- [ ] **Step 3: Build e checar não estoura**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add app/game/environment.ts
git commit -m "fix(light): texturas sem escurecer e intensidade 2x"
```

### Task 3: Kit office 3D — mesas, cadeiras, estantes

**Files:**
- Create: `public/models/office/` (desk_L.glb, chair.glb, shelf.glb — Kenney Office Kit, Draco)
- Modify: `app/game/environment.ts:600-650` (loadOfficeKit)
- Test: entrar em W1, ver mesa+cadeira+planta

**Interfaces:**
- Consumes: `GLTFLoader`, `DRACOLoader.setDecoderPath('/draco/')`
- Produces: `colliders.push({minX,maxX,minZ,maxZ})` por móvel

- [ ] **Step 1: Baixar 5 GLBs Kenney Office Kit para public/models/office/ e copiar draco decoder para public/draco/**

- [ ] **Step 2: Implementar loadOfficeKit**

```ts
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
const draco = new DRACOLoader(); draco.setDecoderPath('/draco/');
const gltf = new GLTFLoader(); gltf.setDRACOLoader(draco);
gltf.load('/models/office/desk_L.glb', gltf => {
  gltf.scene.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; }});
  // clone por sala aberta
});
```

- [ ] **Step 3: Posicionar por sala aberta (farWall-1.2), adicionar colliders AABB 0.8 nos tampos e plantas**

- [ ] **Step 4: Fallback — se load erro, manter box atual (não quebrar)**

- [ ] **Step 5: Commit**

```bash
git add app/game/environment.ts public/models/office/*
git commit -m "feat(office): kit 3D com colisores e fallback"
```

### Task 4: Física — cliente e servidor sem atravessar

**Files:**
- Modify: `app/game/engine.ts:511-540` (blocked, move, crouchLerp)
- Modify: `server/game/movement.ts:9-21` (clampMove com colliders)
- Modify: `server/game/room.ts:21-29` (move com crouch e colliders)
- Test: `server/company.test.ts` + manual contra mesa

**Interfaces:**
- Consumes: `env.colliders: {minX,maxX,minZ,maxZ,maxY?}[]`, `lockedRooms:Set`
- Produces: `clampMove(from,to,colliders,lockedRooms)` booleano

- [ ] **Step 1: No cliente, reduzir r para agachado**

```ts
const r = 0.32 - this.crouchLerp*0.10; // 0.32 em pé, 0.22 agachado
this.move(camera.position, velocity.x*dt, velocity.z*dt, r, feetY);
```

- [ ] **Step 2: No servidor, estender clampMove**

```ts
export function clampMove(from,to,colliders,lockedRooms){ /* bounds, MAX_STEP, doors trancadas, AABB móveis */ }
```

- [ ] **Step 3: Passar colliders + lockedRooms de manager.ensureRoom para room.move**

- [ ] **Step 4: Run tests**

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/game npm run server:test
```

- [ ] **Step 5: Commit**

```bash
git add app/game/engine.ts server/game/movement.ts server/game/room.ts
git commit -m "fix(physics): colliders de moveis e crouch no server"
```

### Task 5: Personagens blocky — escolha no cadastro + aleatório NOS NPCs

**Files:**
- Modify: `app/game/figures.ts` (já tem 4 variantes; adicionar FBX mapping)
- Modify: `app/game/engine.ts:makeRemote` (FBXLoader async, fallback)
- Modify: `app/page.tsx` (cards de personagem já existem em register, garantir envio)
- Modify: `server/auth/routes.ts`, `server/db/schema.ts` (já tem character)
- Test: registrar azul → welcome.character==='azul', NPC hash estável

**Interfaces:**
- Consumes: `FIGURE_VARIANTS`, `variantForId(id)`, `public/characters/*.fbx`
- Produces: `NetPlayer.character`, `users.character`

- [ ] **Step 1: Em figures.ts, mapear id→fbx**

```ts
export const FBX_MAP = {azul:'character-a.fbx',verde:'character-e.fbx',vermelho:'character-i.fbx',roxo:'character-m.fbx'};
```

- [ ] **Step 2: Em engine.ts makeRemote, tentar FBXLoader**

```ts
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
const loader = new FBXLoader();
loader.load(`/characters/${FBX_MAP[variant]}`, fbx => {
  fbx.scale.set(0.012,0.012,0.012); // blocky ≈ 1.7m
  g.add(fbx);
}, undefined, ()=>{ /* fallback já está */ });
```

- [ ] **Step 3: Garantir setRemotePlayers usa variantForId para NPCs quando character ausente**

- [ ] **Step 4: Commit**

```bash
git add app/game/figures.ts app/game/engine.ts
git commit -m "feat(chars): blocky FBX com fallback procedural"
```

### Task 6: Polimento final + testes + deploy

**Files:**
- Modify: `app/globals.css` (sci-fi glow já feito), `THIRD_PARTY_NOTICES.md`
- Test: `npm run build && DATABASE_URL=... npm run server:test` 35/35

- [ ] **Step 1: Atualizar THIRD_PARTY_NOTICES com Kenney Office Kit**
- [ ] **Step 2: Build + testes verdes**
- [ ] **Step 3: Commit e push**

```bash
git add -A
git commit -m "chore: kit completo polish + notices"
git push origin main
```
