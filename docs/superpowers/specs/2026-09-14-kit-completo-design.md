# Kit Completo — Escritório Real (Portas, Luz, Móveis, Física + Personagens)

**Data:** 2026-09-14
**Status:** Aprovado (seções 1-6 ok)
**Escopo:** Vida no escritório (opção B, caminho 2) + personagens blocky escolhíveis — sem gavetas interativas, sem dia/noite

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

## 7. Seção 5 — Personagens blocky (escolha + aleatório)
- **Problema:** hoje `makeRemote` gera caixa colorida; cadastro com `FIGURE_VARIANTS` (azul/verde/vermelho/roxo) existe mas não é usado no lobby/sala
- **Modelos:** Kenney Blocky Characters (CC0) — `character-a/e/i/m.fbx` (4 de 18) + `texture-a..r.png` já em `public/characters/`; fallback humanoide procedural atual (`FIG_*_GEO` + `poseFig`)
- **Fluxo cadastro:** `POST /auth/register {username,password,character}` valida `enum['azul','verde','vermelho','roxo']`, salva em `users.character`, retorna em `login`/`register` e no `welcome` (`NetPlayer.character`); `page.tsx` login mostra 4 cards clicáveis só em `register`
- **Fluxo sala:** `WS ?room=CODE&token` → `welcome.character` do dono já vem; demais players recebem `character` via `snapshotPlayers`; NPCs usam `variantForId(id)` (hash estável) para variar sem escolher
- **Render:** `engine.ts: makeRemote(username, variantId)` tenta `FBXLoader` async para `/characters/character-<letra>.fbx`; se ok, clona `Group` FBX escalado 0.012×, aplica `shirt/pants/skin` nos materiais; se falhar/pending usa humanoide low-poly atual; `poseFig` continua em ambos
- **Lobby:** ao `Criar sala` o criador já entra com seu `character`; convidado mantém o seu; sem re-escolha por sala nesta spec
- **Teste:** registrar `azul` → `welcome.character==='azul'`; NPC `bot-123` sempre mesma cor; sem FBX não quebra (procedural)
- **Migrado:** falta ligar `character` no `setRemotePlayers` para remotos e em `setCompanyBots/Devs/Receps/Hired` para NPCs (hash)

## 8. Seção 6 — Testes e rollout
- **Flag:** `ENABLE_OFFICE_KIT` default true; se GLB/FBX falhar, fallback caixa/humanóide mantém jogo jogável
- **Migração:** sem migração de save; `ownedRooms` padrão `['W1','E1']` já serializado; `users.character` default `'azul'` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- **Build:** `vite build` e `tsc -p server/tsconfig.json` sem erros; `npm run server:test` 35/35
- **Verificação:** `verify-world.mjs` checa colisores; adicionar asserts para `lockedRooms`, intensidade de luz e `character` no `welcome`

## 9. Fora de escopo desta spec
Gavetas que abrem, dia/noite, chuva, café/bebedouro interativo, ar-condicionado, voz proximidade. Ficam para specs seguintes.

## 10. Riscos e mitigação
- GLB/FBX pesa build: Draco + LOD, lazy load após `start()`, FBX só em `characters/` (não no bundle)
- Luz mais forte estoura: testar com `ACESFilmicToneMapping` exposure 1.05 já existente
- Colisores extras derrubam fps: manter AABB 2D, sem Rapier
