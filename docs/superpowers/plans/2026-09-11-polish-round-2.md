# Polimento Rodada 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os bugs de gameplay vistos no vídeo e evoluir o shell do Windows XP (janelas + persistência por computador).

**Architecture:** Fase 1 mexe em `engine.ts`, `environment.ts`, `page.tsx`, `server/ws.ts`, `server/game/room.ts`. Fase 2 cria `app/game/xp.tsx` (window manager) e refatora o overlay em `page.tsx`. Fase 3 adiciona colunas/tabela no Drizzle + rotas Fastify e liga o desktop aos arquivos. Fase 4 ajusta geometria/material em `environment.ts`.

**Tech Stack:** React 19 + TS, Three.js r180, Fastify + @fastify/websocket, Drizzle + Postgres, Playwright.

## Global Constraints

- Branch `main` neste repositório.
- UTF-8 sempre; nunca corromper acentos (`�`).
- Não usar `window.prompt` no produto final.
- Rodar `npm test`, `npm run server:test`, `npm run build`, `npm run lint` antes de cada commit de task.
- Rota de backend local: `window.location.hostname` + `:3001`.
- Raio de interação alvo: `1.2 m`.

---

## Fase 1 — Bugs críticos de jogo

### Task 1: Remotos corretos (sem fantasma, com movimento)

**Files:**
- Modify: `server/ws.ts`
- Modify: `server/game/room.ts`
- Modify: `app/game/net.ts`
- Modify: `app/page.tsx`
- Test: `server/game.test.ts`

**Interfaces:**
- Produces: `welcome.id: string`; `Welcome.id` no cliente; `applyPlayers(list: NetPlayer[])`.
- Consumes: `GameRoom.players` (Map), `GameRoom.snapshotPlayers()`.

- [ ] **Step 1: Broadcast de posição no move (server)**

Em `server/ws.ts`, no handler `m.type === 'move'`, após `room.move(...)`:

```ts
room.move(userId, m.x, m.z, m.yaw);
room.broadcast({ type: 'players', players: room.snapshotPlayers() }, conn);
```

- [ ] **Step 2: `close` não bloqueia a remoção (server)**

Substituir o handler de `close` por:

```ts
socket.on('close', () => {
  void room.savePosition(userId);
  room.leave(userId);
  room.broadcast({ type: 'players', players: room.snapshotPlayers() });
});
```

- [ ] **Step 3: `welcome` inclui `id` (server)**

No `socket.send` do `welcome`, adicionar `id: userId,` logo após `type: 'welcome',`.

- [ ] **Step 4: Teste do server (reconnect + leave broadcast)**

Em `server/game.test.ts`, adicionar:

```ts
test('reconnect do mesmo usuário não duplica e leave remove', () => {
  const room = new GameRoom();
  const sent: string[] = [];
  const a = { id: 'u1', username: 'ana', x: 0, z: 0, yaw: 0 };
  room.addPlayer(a, { send: (d) => sent.push(d) });
  room.addPlayer({ ...a, x: 5 }, { send: (d) => sent.push(d) });
  assert.equal(room.snapshotPlayers().length, 1);
  room.leave('u1');
  assert.equal(room.snapshotPlayers().length, 0);
});
```

Rodar: `npm run server:test` → PASS.

- [ ] **Step 5: Tipo `Welcome.id` (client)**

Em `app/game/net.ts`, adicionar `id: string;` ao tipo `Welcome`.

- [ ] **Step 6: `applyPlayers` filtrando o próprio jogador (page.tsx)**

Em `app/page.tsx`: adicionar `const selfId = useRef('');`. No `onWelcome`, setar
`selfId.current = w.id;` e trocar `engine.current?.setRemotePlayers(w.players);` por
chamada a `applyPlayers`. Definir a função antes do efeito:

```ts
const applyPlayers = (list: import('./game/net').NetPlayer[]) => {
  const others = list.filter((p) => p.id !== selfId.current);
  setPlayers(others);
  engine.current?.setRemotePlayers(others);
};
```

Trocar `n.onPlayers = setPlayers;` por `n.onPlayers = applyPlayers;` e, no `onWelcome`,
usar `applyPlayers(w.players)`.

- [ ] **Step 7: HUD conta os outros**

O HUD já usa `players.length`; agora `players` só tem os outros. Nenhuma mudança extra.

- [ ] **Step 8: Verificar**

Rodar `npm run server:test && npm test && npm run build && npm run lint`. Commitar:
`fix(mp): remotos atualizam, saem ao desconectar e não clonam o próprio jogador`.

---

### Task 2: Porta sólida e com abertura direcional

**Files:**
- Modify: `app/game/engine.ts`

**Interfaces:**
- Consumes: `env.doors` (`{ group, x, z, side, half, plane }`).
- Produces: `doorBlocked` e `updateDoors` corrigidos.

- [ ] **Step 1: Bloquear enquanto não estiver aberta**

Em `doorBlocked`, trocar `if (Math.abs(d.group.rotation.y) > 0.4) continue;` por
`if (Math.abs(d.group.rotation.y) > 1.2) continue;`.

- [ ] **Step 2: Sentido conforme de onde o jogador vem**

Substituir o corpo de `updateDoors` por:

```ts
updateDoors(dt: number) {
  const k = 1 - Math.exp(-dt * 9);
  for (const d of this.env.doors) {
    const dist = Math.hypot(
      this.camera.position.x - d.x,
      this.camera.position.z - d.z,
    );
    let target = 0;
    if (dist < 1.2) {
      const fromRoom =
        d.plane === 'x'
          ? Math.abs(this.camera.position.x) > this.halfCorridor()
          : this.camera.position.z > d.z;
      target = (fromRoom ? -d.side : d.side) * (d.plane === 'z' ? -1 : 1) * 1.55;
    }
    d.group.rotation.y += (target - d.group.rotation.y) * k;
  }
}
```

Adicionar o helper na classe:

```ts
halfCorridor() {
  return 1.5;
}
```

> Nota de execução: o sinal do `plane:'z'` deve ser confirmado visualmente; se a porta
> de spawn abrir para o lado errado, inverter o fator `(d.plane === 'z' ? -1 : 1)`.

- [ ] **Step 3: Teste headless (verify-movement)**

Adicionar asserções: com a porta fechada (`rotation.y = 0`), `doorBlocked` do centro do
vão retorna `true`; com `rotation.y = 1.55`, retorna `false`. Usar a mesma mecânica de
transpile/fixtures já presente em `verify-movement.mjs`.

- [ ] **Step 4: Verificar e commitar**

`npm test && npm run build && npm run lint`.
Commit: `fix(door): porta sólida fechada e abertura conforme a direção do jogador`.

---

### Task 3: Luz da sala realmente escurece

**Files:**
- Modify: `app/game/environment.ts`

- [ ] **Step 1: Retunar globais e point lights**

Trocar:

```ts
scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a4, 0.7));
scene.add(new THREE.AmbientLight(0xffffff, 0.12));
const lamp = new THREE.DirectionalLight(0xfff4e2, 0.6);
```

por:

```ts
scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a4, 0.26));
scene.add(new THREE.AmbientLight(0xffffff, 0.05));
const lamp = new THREE.DirectionalLight(0xfff4e2, 0.22);
```

E subir as luzes locais: corredor `new THREE.PointLight(0xfff2e0, 9, 13, 2)`, sala
`new THREE.PointLight(0xffe9c8, 8, 9, 2)`.

- [ ] **Step 2: Verificação de brilho (verify-browser)**

Adicionar ao `verify-browser.mjs`: posicionar o jogador dentro de uma sala, tirar
screenshot, `applyLight(roomId, false)`, aguardar 300 ms, novo screenshot, e calcular a
luminância média dos PNGs. Falhar se a média não cair ao menos 15%.

- [ ] **Step 3: Verificar e commitar**

`npm test && npm run build && npm run lint`.
Commit: `fix(light): sala apagada fica escura (globais reduzidas, point lights reforçadas)`.

---

### Task 4: Alcance de interação de 1,2 m

**Files:**
- Modify: `app/game/engine.ts`

- [ ] **Step 1: Reduzir distâncias em `updateRooms`**

Trocar `if (d < 3 && toSwitch.normalize().dot(forward) > 0.97)` por
`if (d < 1.2 && toSwitch.normalize().dot(forward) > 0.9)` e
`if (d < 3.5 && toNb.normalize().dot(forward) > 0.85)` por
`if (d < 1.2 && toNb.normalize().dot(forward) > 0.85)`.

- [ ] **Step 2: Ajustar verify-browser**

A mira do notebook hoje posiciona o jogador a 1.5 m; mudar para `n.x - side * 1.0`.
Adicionar checagem: posicionado a 3 m com mira no notebook, `notebookTarget` deve ser
`null`.

- [ ] **Step 3: Verificar e commitar**

`npm test && npm run build && npm run lint`.
Commit: `fix(interact): prompt e ação só a até 1,2 m`.

---

### Task 5: Eliminar z-fighting do vidro

**Files:**
- Modify: `app/game/environment.ts`

- [ ] **Step 1: Remover piso/teto redundantes da sala de spawn**

Apagar a criação de `spawnFloor` e `spawnCeil` (bloco que começa em
`const spawnFloor = ...` até `scene.add(spawnCeil);`).

- [ ] **Step 2: Estender piso/teto principal**

Trocar `new THREE.PlaneGeometry(40, 54)` do `floor` e do `ceil` por
`new THREE.PlaneGeometry(40, 57)`, e o centro de `-11` para `-9.5` nos dois.

- [ ] **Step 3: `polygonOffset` no vidro**

No `glassMat`, adicionar `polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2`.

- [ ] **Step 4: Verificar e commitar**

`npm test && npm run build && npm run lint`; checar visualmente (screenshot) que não há
flicker. Commit: `fix(glass): remove z-fighting (piso único + polygonOffset)`.

---

### Task 6: Spawn olhando o corredor + `=` na calculadora

**Files:**
- Modify: `app/game/environment.ts`
- Modify: `app/game/desktop.tsx`

- [ ] **Step 1: Spawn**

Trocar `spawn: { x: 0, z: 16.5, yaw: 0 }` por `spawn: { x: 0, z: 15.6, yaw: 0 }`.

- [ ] **Step 2: `=` no grid da calculadora**

No array de teclas, trocar `'0', '.', 'C', '+'` por `'0', '.', 'C', '='` e remover o
botão de `=` separado. Em `press`, manter o caso `'='`.

- [ ] **Step 3: Verificar no browser**

Adicionar em `verify-browser.mjs`: abrir calculadora, clicar `3`,`*`,`8`,`=` e conferir
`display === '24'`.

- [ ] **Step 4: Verificar e commitar**

`npm test && npm run build && npm run lint`.
Commit: `fix(spawn,calc): spawn para o corredor e = no teclado`.

---

## Fase 2 — Shell do Windows XP

### Task 7: Window manager (`app/game/xp.tsx`)

**Files:**
- Create: `app/game/xp.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `type Win = { id: string; app: XpApp; x: number; y: number; minimized: boolean; z: number }`;
  `useWindows()` → `{ windows, open, close, minimize, restore, focus, move }`;
  `<XPWindow win active onFocus onClose onMinimize onMove>`.
- Consumes: nada.

- [ ] **Step 1: Criar o módulo**

Implementar:
- `useWindows()` com `open(app)` que cria janela com offset em cascata, `close`, `minimize`
  (marca `minimized`), `restore`, `focus` (incrementa `z`), `move(id, x, y)`.
- `XPWindow`: `<div className="xp-window">` com `<div className="xp-titlebar">` (título,
  botões `_` e `X`), conteúdo em `<div className="xp-body">`. Arraste com
  `onPointerDown` no titlebar + `onPointerMove`/`onPointerUp` no `window`; ignore o
  arraste quando o alvo for um botão.
- Sem maximizar.

- [ ] **Step 2: CSS das janelas**

Adicionar em `globals.css`: `.xp-window` (posicionada absoluta, `min-width`, borda 3D XP),
`.xp-titlebar` (gradiente azul, `cursor: move`), `.xp-titlebar button`, `.xp-body`.
Ajustar `.xp-app` para `width:100%;box-sizing:border-box` (sem `position:absolute`).

- [ ] **Step 3: Verificar e commitar**

`npm run build && npm run lint`. Commit: `feat(xp): window manager com arrastar/minimizar/fechar`.

---

### Task 8: Integrar apps e limpar menu/ícones

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Renderizar janelas**

Substituir o bloco `{xpApp === 'notepad' && ...}` etc. por um `windows.map` que renderiza
`<XPWindow>` com o conteúdo por `app`: `notepad` → `<Notepad computerId={state.desktopRoom}/>`,
`calc` → `<Calculator/>`, `plaque` → `<PlaqueEditor .../>`.

- [ ] **Step 2: Barra de tarefas**

Renderizar um botão por janela; clique alterna `restore`/`focus`.

- [ ] **Step 3: Menu e ícones**

Remover "Programas" e "Documentos" do `.xp-menu` (manter "Encerrar sessão"). Remover o
botão "Área de trabalho" de `.xp-icons`.

- [ ] **Step 4: Verificar e commitar**

`npm run build && npm run lint`; E2E abre/fecha/minimiza. Commit:
`feat(xp): apps em janelas, taskbar e menu enxuto`.

---

### Task 9: Bloco de notas fiel e responsivo (sem `window.prompt`)

**Files:**
- Modify: `app/game/desktop.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Modal in-game**

Trocar o `prompt('Nome do arquivo')` por estado local `creating` + `newName`, exibindo
um `<form className="xp-modal">` com input e botões OK/Cancelar.

- [ ] **Step 2: Título e salvar**

Mostrar o nome do arquivo ativo na barra da janela (via prop/estado no `XPWindow`) e
adicionar botão "Salvar" explícito além do autosave; exibir status "salvando…/salvo".

- [ ] **Step 3: CSS**

`.xp-app label`, `.xp-app input`, `.xp-app textarea`, `.xp-app button` com
`width:100%;box-sizing:border-box` e `display:block` onde couber; `.xp-modal` centralizado.

- [ ] **Step 4: Verificar e commitar**

`npm run build && npm run lint`; E2E: criar arquivo sem prompt nativo. Commit:
`feat(notepad): modal in-game, título e salvar explícito`.

---

## Fase 3 — Persistência por computador

### Task 10: Schema (posição de ícone + estado do computador)

**Files:**
- Modify: `server/db/schema.ts`
- Modify: `server/db/client.ts`

- [ ] **Step 1: Colunas**

Em `computerFiles`, adicionar `posX: real('pos_x').notNull().default(0)` e
`posY: real('pos_y').notNull().default(0)`. Criar tabela:

```ts
export const computerState = pgTable('computer_state', {
  computerId: text('computer_id').primaryKey(),
  state: jsonb('state').notNull().default({}),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

- [ ] **Step 2: Migração idempotente**

Em `migrate()`, adicionar:

```sql
ALTER TABLE computer_files ADD COLUMN IF NOT EXISTS pos_x real NOT NULL DEFAULT 0;
ALTER TABLE computer_files ADD COLUMN IF NOT EXISTS pos_y real NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS computer_state (
  computer_id text PRIMARY KEY,
  state jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 3: Verificar e commitar**

`npm run server:test`. Commit: `feat(db): posição de ícone e estado por computador`.

---

### Task 11: Rotas de posição e estado

**Files:**
- Modify: `server/game/files.ts`

- [ ] **Step 1: `PUT /files/:id` aceita posição**

Estender o schema Zod do corpo para `{ content?: string; posX?: number; posY?: number }`
e atualizar apenas os campos enviados.

- [ ] **Step 2: Rotas de estado**

Adicionar `GET /computers/:id/state` e `PUT /computers/:id/state` (upsert em
`computer_state`), protegidas por `requireAuth`.

- [ ] **Step 3: Verificar e commitar**

Teste de integração manual (register → PUT posição → GET state). Commit:
`feat(api): posições de ícones e estado por computador`.

---

### Task 12: Desktop com arquivos como ícones arrastáveis

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/game/desktop.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Ícones**

Renderizar os arquivos do computador atual como ícones na área de trabalho (carregados
via `/files?computer=`), posicionados por `posX/posY`, arrastáveis; ao soltar, `PUT`
da posição.

- [ ] **Step 2: Verificar e commitar**

E2E: criar arquivo, arrastar, recarregar, posição mantida. Commit:
`feat(desktop): arquivos como ícones arrastáveis com posição salva`.

---

### Task 13: Persistir layout de janelas por computador

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/game/xp.tsx`

- [ ] **Step 1: Salvar/restaurar**

Ao abrir o desktop de um computador, `GET /computers/:id/state` e hidratar `useWindows`;
em mudanças (open/close/move/minimize), `PUT` debounced (500 ms) do layout.

- [ ] **Step 2: Verificar e commitar**

E2E: abrir janelas, sair, voltar e conferir layout. Commit:
`feat(xp): layout de janelas persiste por computador`.

---

## Fase 4 — Visual / gameplay

### Task 14: Placa sem fundo verde (texto direto no vidro)

**Files:**
- Modify: `app/game/environment.ts`

- [ ] **Step 1: Canvas transparente**

Em `makePlaque`, usar `ctx.clearRect` em vez de `fillRect` de fundo; `mat` com
`transparent: true`; desenhar apenas o texto (branco/ciano) com leve `shadowBlur`.
Fallback sem `document`: `MeshBasicMaterial({ transparent: true, opacity: 0 })` (ou
texto via geometria quando houver canvas).

- [ ] **Step 2: Verificar e commitar**

`npm test` (verify-world confere 6 placas e texto). Commit:
`fix(plaque): texto direto no vidro, sem fundo verde`.

---

### Task 15: Mesas recuadas e notebook orientado

**Files:**
- Modify: `app/game/environment.ts`

- [ ] **Step 1: Recuar a mesa**

Mover a mesa para perto da parede do fundo: `deskX = side * (halfCorridor + roomDepth - 1.4)`
(em vez de `roomX`), mantendo o collider e o ponto do notebook coerentes.

- [ ] **Step 2: Orientar o notebook**

Modelar o notebook como base + tela num `THREE.Group` posicionado sobre a mesa, com o
teclado voltado para a porta (lado `-side` em x) e a tampa/costas para a parede do fundo.
Atualizar `notebooks.push({ roomId, x, y, z })` para o centro da tela.

- [ ] **Step 3: Verificar e commitar**

`npm test && npm run build && npm run lint`; E2E mira/interage continua passando. Commit:
`fix(layout): mesas recuadas e notebook virado para o interior`.

---

### Task 16: Verificação final

- [ ] `npm test && npm run server:test && npm run build && npm run lint`
- [ ] `node verify-browser.mjs` (com backend + dev no ar)
- [ ] Reportar resultado e opções de finishing.

## Self-Review

- **Cobertura**: 10 bugs + 14 pedidos mapeados entre Tasks 1–15; menu/ícones na Task 8;
  persistência Tasks 10–13; visual Tasks 14–15.
- **Sem placeholders**: cada task tem arquivos, ação e verificação.
- **Consistência de tipos**: `Win`/`useWindows` (Task 7) usados nas Tasks 8 e 13;
  `posX/posY` (Task 10) usados nas Tasks 11–12.
- **Risco conhecido**: sinal de abertura da porta `plane:'z'` (Task 2) e tuning de luz
  (Task 3) exigem confirmação visual; ambas têm passo de verificação.
