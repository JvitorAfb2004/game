# Spec: Multiplayer Office Backend

## Objective

Adicionar contas, presença multiplayer e computadores por sala ao jogo de
escritório (Blackwater / MERIDIAN). O jogo passa a ter **uma única sala de
jogo**. Ao entrar, o jogador digita usuário e senha; a posição é salva e ele
renasce onde parou. Novos usuários nascem numa sala de spawn separada. HUD
mostra FPS e quem está na sala. Cada um dos 6 computadores guarda seus
próprios arquivos e controla a placa de LED da sala.

## Capability Map

| Module id | Responsibility | Depends on |
| --- | --- | --- |
| identity | Conta user+senha, login/refresh JWT, persistência local | — |
| presence | Sala única, spawn por posição salva, lista de presentes, FPS | identity |
| world | Sala de spawn com porta para o corredor, placa de LED no vidro | presence, identity |
| computer | 6 PCs, bloco de notas e calculadora por máquina (compartilhado) | identity |
| room-state | Nome da placa editável via notebook, replicado | computer |
| interact | Luz da sala por clique no switch (E continua como atalho) | world |

Build order: identity → presence/world → computer/room-state → interact.

## Tech Stack

- Backend: Node.js 24 + TypeScript, **Fastify** + `@fastify/websocket`
  (WebSocket nativo, sem Socket.IO), **Drizzle ORM**, **Zod**, **bcrypt**,
  **jsonwebtoken**, **ioredis**.
- Banco: Postgres `postgres://postgres:i5zoesh13w462760y1w1@192.64.85.57:5436/game?sslmode=disable`.
- Cache/pub-sub: Redis `redis://default:t6i91vsz0paf1snkghda@192.64.85.57:6394`.
- Front: React 19 + Three.js r180 (existente), cliente WS em
  `app/game/net.ts` com reconexão e fallback solo.

## Commands

```
Backend dev:   npm run server        # tsx watch server/index.ts (porta 3001)
Backend build: npm run server:build  # tsc -p server/tsconfig.json
Backend test:  npm run server:test   # node --test server/**/*.test.ts
Front dev:     npm run dev           # vite, 5173
Front build:   npm run build         # tsc --noEmit && vite build
All tests:     npm test
Lint:          npm run lint
```

## Project Structure

```
server/
  index.ts          # bootstrap Fastify, plugins, WS, rotas
  env.ts            # leitura/validação de variáveis (DATABASE_URL, REDIS_URL, JWT_SECRET)
  db/
    schema.ts       # tabelas Drizzle: users, player_positions, computer_files, room_state
    client.ts       # pool pg + drizzle, migração idempotente
  auth/
    routes.ts       # POST /auth/register, /auth/login, /auth/refresh
    tokens.ts       # assinar/verificar JWT
    password.ts     # hash/verify bcrypt
  game/
    room.ts         # estado da sala única, presença, tick 20Hz
    movement.ts     # validação de movimento com colisores compartilhados
    protocol.ts     # schemas Zod das mensagens WS (cliente↔servidor)
    routes.ts       # rotas REST de arquivos e placa
  ws.ts             # handler WebSocket: join, move, light, chat de presença
  types.ts          # tipos compartilhados do protocolo
app/game/
  net.ts            # cliente WS: conexão, reconexão backoff, fallback solo
  hud.ts            # render FPS + lista de presentes
client/             # (front existente) integração nas telas
```

## Code Style

```ts
// server/game/protocol.ts — mensagens validadas com Zod; nomes estáveis.
export const joinSchema = z.object({
  type: z.literal('join'),
  token: z.string().min(1),
});
export type JoinMsg = z.infer<typeof joinSchema>;
```

- Validação Zod em toda borda (HTTP e WS); nada confia no cliente.
- Colisão compartilhada: front exporta `colliders` e o servidor reusa os
  mesmos retângulos (`{x, z, w, d}`) para rejeitar posição inválida.
- Sem abstrações de uma implementação só; sem ORM além do Drizzle.

## Data Model (Postgres)

```sql
users(id uuid pk, username citext unique not null, password_hash text not null,
      created_at timestamptz default now())
player_positions(user_id uuid pk fk users, x real, y real, z real, yaw real,
                 updated_at timestamptz default now())
computer_files(id uuid pk, computer_id text not null, name text not null,
               content text default '', updated_at timestamptz default now(),
               unique(computer_id, name))
room_state(room_id text pk, plaque_text text default '')
```

`computer_id` = id da sala (6 salas). `room_state.room_id` = id da sala.

## Protocol (WebSocket `ws://192.64.85.57:3001/ws`)

Cliente→servidor: `join`, `move {x,z,yaw}`, `light {roomId,on}`,
`plaque {roomId,text}`.
Servidor→cliente: `welcome {selfId,spawn,players,rooms}`, `players [...]`,
`light {roomId,on}`, `plaque {roomId,text}`, `fps` (telemetria opcional).

Tick 20Hz; movimento validado e difundido; luz e placa são fonte de verdade
do servidor (todos veem igual). `fps` é só telemetria, nunca validado.

## Error Handling & States

- Registro com username existente → HTTP 409 “usuário em uso”.
- Login inválido → 401 genérico.
- Token expirado → refresh automático; se falhar, volta à tela de login.
- WS cai → reconexão com backoff; após 3 falhas entra em **modo solo**
  (aviso discreto) e a sala volta ao reconectar.
- Autosave de arquivo/placa a cada 800ms; falha mostra erro e mantém o texto
  local (sem perda silenciosa).
- Toda query parametrizada; senha nunca logada.

## Testing Strategy

- Backend: `node:test` + um Postgres/Redis de teste (ou mocks de repositório).
  Cobrir: register duplicado, login, refresh, join com posição salva vs novo,
  validação de movimento (posição inválida rejeitada), permissão de arquivo por
  computador, edição de placa replicada.
- Front: `verify-browser.mjs` (Playwright) cobre login, HUD de FPS/presença,
  abrir notebook, criar arquivo, editar placa, clique na luz.
- `npm test` continua verde (verify-world/movement/graphics).

## Boundaries

- Always: rodar testes antes de commitar; validar entrada no servidor em toda
  borda; UTF-8 em tudo.
- Ask first: mudar schema do banco; adicionar dependência; expor porta nova.
- Never: commitar `JWT_SECRET`/credenciais; remover teste que falha; confiar em
  posição/estado vindo do cliente.

## Success Criteria

1. Registrar/login com usuário único; credenciais persistem no `localStorage`.
2. Segundo cliente logado aparece como boneco e na lista de presentes.
3. Recorrente renasce na última posição; novo nasce na sala de spawn com porta
   de frente para o corredor.
4. HUD mostra FPS e contagem/lista de quem está na sala.
5. Cada PC cria/edita/exclui arquivos compartilhados por máquina; calculadora
   funciona; recarregar mantém arquivos.
6. Notebook edita o nome da placa de LED no vidro, replicado para todos.
7. Luz da sala acende com clique no switch; E continua funcionando.
8. Queda de WS não quebra o jogo (modo solo + reconexão).

## Open Questions

Nenhuma pendente — decisões de escopo confirmadas com o usuário.
