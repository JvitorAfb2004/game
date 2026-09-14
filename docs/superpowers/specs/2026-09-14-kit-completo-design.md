# Kit Completo — Escritório Real (Portas, Luz, Móveis, Física)

**Data:** 2026-09-14
**Status:** Aprovado (seções 1-5 ok)
**Escopo:** Vida no escritório (opção B, caminho 2) — sem gavetas interativas, sem dia/noite

## 1. Objetivo
Tornar as salas alugáveis críveis: porta trancada não abre, interior claro apesar das texturas, móveis 3D reais com colisão sólida, sem atravessar paredes/móveis para players e NPCs. Manter 60fps e 35 testes verdes.

## 2. Contexto
- Mapa 48×60m, 6 salas (W1 W2 W3 E1 E2 E3) + copa + recepção + spawn, beco x4..6
- Salas padrão: W1+E1+copa+recepção abertas; W2 W3 E2 E3 via `ownedRooms` + `ROOM_RENT`
- `environment.ts` gera paredes/chão/teto com `InstancedMesh`; `engine.ts` controla `doorBlocked`, `blocked`, `updateDoors`, `updateRooms`, luzes pontuais
- Texturas Kenney já aplicadas (`wall_brick_small_stone`, `floor_tiles_tan_small`, `wall_timber_structure`, `door_wood`) escureceram o interior
- Colisão atual: cliente `blocked(x,z,r,feet)` com `doorBlocked` + `env.colliders`; servidor só `clampMove` com bounds + `MAX_STEP`

## 3. Seção 1 — Portas de salas trancadas
- **Regra:** `lockedRooms = ['W1'..'E3'] - ownedRooms`. Se `lockedRooms.has(roomId)`, porta fica fechada e não anima, `doorBlocked` retorna true mesmo com `feet>0.5` ou `group.rotation`
- **Mudanças:**
  - `engine.ts: updateDoors()` — checa `lockedRooms` antes de calcular `target`; trancada => `target=0`
  - `engine.ts: doorBlocked()` — já trava, manter; adicionar early return para trancadas
  - `engine.ts: updateRooms()` prompt já existe; manter
  - `engine.ts: setLockedRooms(ids)` + `serverPlaques` já existentes
- **Servidor:** já valida `placeBox` e `setRhRoom` contra `ownedRooms`; sem mudança
- **Placas:** `🔒 À VENDA` quando trancada e sem texto custom do servidor
- **Teste:** `E` em porta trancada não abre, prompt aparece, colisão impede mesmo pulando; após `rentRoom` porta abre normal

## 4. Seção 2 — Luz
- **Problema:** textura multiplica por `color`; `color 0x9aa0a0 * map` escurece
- **Mudanças:**
  - `environment.ts: applyTex()` — quando `map` presente, `mat.color.set(0xffffff)` para não escurecer
  - `corridorWallMat` e `wallMat` com `wall_brick_small_stone.png` (2,1) e `wall_timber_structure.png` (1.5,1)
  - `floorMat` com `floor_tiles_tan_small.png` (6,9)
  - Luzes: `PointLight` de sala aberta `intensity 14`, `distance 18`, `decay 2`; copa `12→14`; corredor `9→11`; `AmbientLight 0.05→0.12`; `Hemisphere 0.26→0.32`
  - `box(ceilMat)` emissiva `ledMat` já existe; manter
  - Sem HDR por enquanto
- **Teste:** lux no centro de W1 a 1.7m >0.6; screenshot antes/depois sem estourar `renderer.info`

## 5. Seção 3 — Kit office 3D
- **Modelos:** Kenney Office Kit (CC0) — `desk_L.glb` (~90KB), `chair_office.glb` (~70KB), `shelf.glb`, `plant.glb`, `trash.glb`. Draco comprimido. Fallback caixa colorida se 404
- **Carga:** `environment.ts: loadOfficeKit()` com `GLTFLoader` + `DRACOLoader` async; após load cria `InstancedMesh` para cadeiras/plantas (6 cada) e `Mesh` único para mesas/estantes por sala
- **Posições:** mesa em L encostada na parede fundo (`farWall -1.2`), cadeira à frente (`desk +0.9`), estante lateral, planta canto, lixeira ao lado da porta
- **Sombras:** `castShadow` e `receiveShadow` true; `InstancedMesh` já com `computeBoundingSphere`
- **Créditos:** `THIRD_PARTY_NOTICES.md` + `public/third-party-notices.txt` com Kenney CC0
- **Teste:** W1 com 1 mesa, 1 cadeira, 1 planta visíveis e com sombra; fallback não quebra se GLB ausente

## 6. Seção 4 — Física
- **Cliente:** `engine.ts: blocked()` já checa `doorBlocked` + `env.colliders`; colisores de móveis adicionados via `colliders.push()` no `environment.ts`; `crouchLerp` reduz `r` 0.32→0.22 quando agachado; `move()` em passos de 0.15m
- **Servidor:** `server/game/movement.ts: clampMove(from,to, colliders, lockedRooms)` passa a receber `colliders[]` e `lockedRooms` da sala; checa bounds, `MAX_STEP 1.5`, portas trancadas e AABB de móveis antes de aceitar; `server/game/room.ts: move()` replica
- **NPCs:** `npcStep()` já respeita `doorBlocked`; manter; `updateHired`/`updateBots` continuam com `leaving` e `poseFig`
- **Teste:** player não atravessa mesa a 0.3m; agachado passa em vão 0.9m (se houver); NPC espera porta abrir; 35 testes de company permanecem verdes

## 7. Seção 5 — Testes e rollout
- **Flag:** `ENABLE_OFFICE_KIT` default true; se GLB falhar, fallback caixa mantém jogo jogável
- **Migração:** sem migração de save; `ownedRooms` padrão `['W1','E1']` já serializado
- **Build:** `vite build` e `tsc -p server/tsconfig.json` sem erros; `npm run server:test` 35/35
- **Verificação:** `verify-world.mjs` checa colisores; adicionar asserts para `lockedRooms` e intensidade de luz

## 8. Fora de escopo desta spec
Gavetas que abrem, dia/noite, chuva, café/bebedouro interativo, ar-condicionado, voz proximidade. Ficam para specs seguintes.

## 9. Riscos e mitigação
- GLB pesa build: Draco + instancing + LOD, lazy load após `start()`
- Luz mais forte estoura: testar com `ACESFilmicToneMapping` exposure 1.05 já existente
- Colisores extras derrubam fps: manter AABB 2D, sem Rapier
