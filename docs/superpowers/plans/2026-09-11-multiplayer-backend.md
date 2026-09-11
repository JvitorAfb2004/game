# Multiplayer Office Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar contas, presença multiplayer, spawn salvo, computadores por sala (bloco de notas/calculadora), placa de LED editável, HUD (FPS + quem está na sala) e luz por clique ao jogo de escritório existente.

**Architecture:** Backend Node.js/TypeScript separado (`server/`) com Fastify + `@fastify/websocket` (WebSocket nativo), Drizzle ORM sobre Postgres, ioredis para presença, JWT + bcryptjs. O front ganha um cliente WS (`app/game/net.ts`) com reconexão e fallback solo, integrado ao `Game` por callbacks. Uma única sala de jogo; posição salva em `player_positions`.

**Tech Stack:** Node 24, Fastify, @fastify/websocket, @fastify/cors, Drizzle ORM, `pg`, `zod`, `bcryptjs`, `jsonwebtoken`, `ioredis`, `tsx`; front React 19 + Three.js r180 existente.

## Global Constraints

- Postgres: `postgres://postgres:i5zoesh13w462760y1w1@192.64.85.57:5436/game?sslmode=disable`
- Redis: `redis://default:t6i91vsz0paf1snkghda@192.64.85.57:6394`
- Servidor local: porta `3001`; WebSocket em `ws://192.64.85.57:3001/ws`.
- Nomes de sala/computador: `W1 W2 W3 E1 E2 E3` (`W` = lado `side -1`, `E` = lado `side 1`; índice 1..3).
- Spawn padrão (usuário novo / offline): `{ x: 0, z: 16.5, yaw: 0 }` na sala de spawn.
- Toda entrada (HTTP e WS) validada com Zod. Senha nunca logada. UTF-8 em tudo.
- Arquivos são por **máquina** (`computer_id` = id da sala), compartilhados.
- Placa pode ser editada por **qualquer** jogador via notebook da sala.
- Não commit de `JWT_SECRET`/credenciais. Rodar `npm test`, `npm run lint` e `npm run build` antes de cada commit.
- Repo `gamefps` usa branch `main`.

---

### Task 1: Backend scaffold + schema + migração + health

**Files:**
- Create: `server/env.ts`
- Create: `server/db/schema.ts`
- Create: `server/db/client.ts`
- Create: `server/index.ts`
- Modify: `package.json` (deps + scripts)
- Create: `server/tsconfig.json`

**Interfaces:**
- Produces: `env` (`{ port, databaseUrl, redisUrl, jwtSecret }`), `db` (Drizzle), `pool` (pg Pool), `migrate(): Promise<void>`, `GET /health -> { ok: true }`.

- [ ] **Step 1: Instalar dependências**

Run:
```bash
npm install fastify @fastify/websocket @fastify/cors pg drizzle-orm zod bcryptjs jsonwebtoken ioredis
npm install -D tsx @types/pg @types/jsonwebtoken
```
Expected: dependências adicionadas ao `package.json` sem erro.

- [ ] **Step 2: Criar `server/env.ts`**

```ts
export const env = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://postgres:i5zoesh13w462760y1w1@192.64.85.57:5436/game?sslmode=disable',
  redisUrl:
    process.env.REDIS_URL ??
    'redis://default:t6i91vsz0paf1snkghda@192.64.85.57:6394',
  jwtSecret: process.env.JWT_SECRET ?? 'meridian-dev-secret-change-me',
};
```

- [ ] **Step 3: Criar `server/db/schema.ts`**

```ts
import { pgTable, uuid, text, real, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const playerPositions = pgTable('player_positions', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  x: real('x').notNull(),
  y: real('y').notNull(),
  z: real('z').notNull(),
  yaw: real('yaw').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const computerFiles = pgTable('computer_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  computerId: text('computer_id').notNull(),
  name: text('name').notNull(),
  content: text('content').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const roomState = pgTable('room_state', {
  roomId: text('room_id').primaryKey(),
  plaqueText: text('plaque_text').notNull().default(''),
});
```

- [ ] **Step 4: Criar `server/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env.ts';
import * as schema from './schema.ts';

export const pool = new Pool({ connectionString: env.databaseUrl, ssl: false });
export const db = drizzle(pool, { schema });

// ponytail: migração idempotente em SQL cru; drizzle-kit é overkill para 4 tabelas.
export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS player_positions (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      x real NOT NULL, y real NOT NULL, z real NOT NULL, yaw real NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS computer_files (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      computer_id text NOT NULL,
      name text NOT NULL,
      content text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (computer_id, name)
    );
    CREATE TABLE IF NOT EXISTS room_state (
      room_id text PRIMARY KEY,
      plaque_text text NOT NULL DEFAULT ''
    );
  `);
}
```

- [ ] **Step 5: Criar `server/index.ts` (só health por enquanto)**

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './env.ts';
import { migrate } from './db/client.ts';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get('/health', async () => ({ ok: true }));

await migrate();
await app.listen({ port: env.port, host: '0.0.0.0' });
console.info(`[server] listening on http://0.0.0.0:${env.port}`);
```

- [ ] **Step 6: Criar `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["."]
}
```

- [ ] **Step 7: Adicionar scripts no `package.json`**

No bloco `"scripts"`, adicionar:
```json
"server": "tsx watch server/index.ts",
"server:build": "tsc -p server/tsconfig.json",
"server:test": "tsx --test server/*.test.ts"
```

- [ ] **Step 8: Verificar que sobe e migra**

Run: `npm run server`
Expected: log `[server] listening on http://0.0.0.0:3001`, e `GET http://192.64.85.57:3001/health` → `{"ok":true}`. Depois parar (Ctrl+C).

- [ ] **Step 9: Verificar tipos do backend**

Run: `npm run server:build`
Expected: sem erros.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json server
git commit -m "feat(server): scaffold fastify, schema postgres e migracao"
```

---

### Task 2: Autenticação (register / login)

**Files:**
- Create: `server/auth/password.ts`
- Create: `server/auth/tokens.ts`
- Create: `server/auth/routes.ts`
- Modify: `server/index.ts`
- Test: `server/auth.test.ts`

**Interfaces:**
- Consumes: `db`, `users`, `pool` de Task 1.
- Produces:
  - `hashPassword(p: string): Promise<string>`, `verifyPassword(p, h): Promise<boolean>`
  - `signToken(userId: string, username: string): string`, `verifyToken(t: string): { sub: string; username: string }`
  - `registerAuthRoutes(app: FastifyInstance): Promise<void>`
  - Rotas `POST /auth/register`, `POST /auth/login` → `{ token, username }`.

- [ ] **Step 1: Escrever o teste que falha**

`server/auth.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAuthRoutes } from './auth/routes.ts';
import { pool } from './db/client.ts';

test('register + login + duplicado', async () => {
  const app = Fastify();
  await app.register(registerAuthRoutes);
  const username = `u${Date.now()}${Math.floor(Math.random() * 1e6)}`;

  const r1 = await app.inject({ method: 'POST', url: '/auth/register', payload: { username, password: 'segredo1' } });
  assert.equal(r1.statusCode, 200);
  assert.equal(r1.json().username, username);
  assert.ok(r1.json().token);

  const dup = await app.inject({ method: 'POST', url: '/auth/register', payload: { username, password: 'outra123' } });
  assert.equal(dup.statusCode, 409);

  const bad = await app.inject({ method: 'POST', url: '/auth/login', payload: { username, password: 'errada' } });
  assert.equal(bad.statusCode, 401);

  const ok = await app.inject({ method: 'POST', url: '/auth/login', payload: { username, password: 'segredo1' } });
  assert.equal(ok.statusCode, 200);

  await pool.query('DELETE FROM users WHERE username = $1', [username]);
  await app.close();
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm run server:test`
Expected: FAIL — `Cannot find module './auth/routes.ts'`.

- [ ] **Step 3: Criar `server/auth/password.ts`**

```ts
import bcrypt from 'bcryptjs';

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);
```

- [ ] **Step 4: Criar `server/auth/tokens.ts`**

```ts
import jwt from 'jsonwebtoken';
import { env } from '../env.ts';

// ponytail: token único de 7d evita endpoint de refresh; adicionar refresh se expiração incomodar.
export const signToken = (userId: string, username: string) =>
  jwt.sign({ sub: userId, username }, env.jwtSecret, { expiresIn: '7d' });

export function verifyToken(token: string): { sub: string; username: string } {
  return jwt.verify(token, env.jwtSecret) as { sub: string; username: string };
}
```

- [ ] **Step 5: Criar `server/auth/routes.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { users } from '../db/schema.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { signToken } from './tokens.ts';

const creds = z.object({
  username: z.string().trim().toLowerCase().min(3).max(24).regex(/^[\w.-]+$/),
  password: z.string().min(4).max(72),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (req, reply) => {
    const parsed = creds.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'dados inválidos' });
    const { username, password } = parsed.data;
    const existing = await db.select().from(users).where(eq(users.username, username));
    if (existing.length) return reply.code(409).send({ error: 'usuário em uso' });
    const [user] = await db
      .insert(users)
      .values({ username, passwordHash: await hashPassword(password) })
      .returning();
    return { token: signToken(user.id, user.username), username: user.username };
  });

  app.post('/auth/login', async (req, reply) => {
    const parsed = creds.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'dados inválidos' });
    const { username, password } = parsed.data;
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user || !(await verifyPassword(password, user.passwordHash)))
      return reply.code(401).send({ error: 'login inválido' });
    return { token: signToken(user.id, user.username), username: user.username };
  });
}
```

- [ ] **Step 6: Registrar no `server/index.ts`**

Adicionar o import e a linha, logo após `app.register(cors...)`:
```ts
import { registerAuthRoutes } from './auth/routes.ts';
// ...
await app.register(registerAuthRoutes);
```

- [ ] **Step 7: Rodar o teste e ver passar**

Run: `npm run server:test`
Expected: PASS (`pass 1`).

- [ ] **Step 8: Commit**

```bash
git add server package.json
git commit -m "feat(server): auth register/login com jwt e bcryptjs"
```

---

### Task 3: Presença, protocolo WS, movimento e spawn

**Files:**
- Create: `server/game/protocol.ts`
- Create: `server/game/movement.ts`
- Create: `server/game/room.ts`
- Create: `server/ws.ts`
- Modify: `server/index.ts`
- Test: `server/game.test.ts`

**Interfaces:**
- Consumes: `db`, `users`, `playerPositions`, `roomState`; `verifyToken`.
- Produces:
  - `clientMsg` (Zod discriminated union: `move`, `light`, `plaque`), `ClientMsg`.
  - `type NetPlayer = { id: string; username: string; x: number; z: number; yaw: number }`.
  - `clampMove(x, z): { x: number; z: number }` (limites + anti-teleporte).
  - `class GameRoom` com `join`, `move`, `setLight`, `setPlaque`, `leave`, `broadcast`, `snapshotPlayers`, `loadPlaques`.
  - `DEFAULT_SPAWN = { x: 0, z: 16.5, yaw: 0 }`.
  - `registerWs(app)`: canal `/ws`.

- [ ] **Step 1: Escrever o teste que falha**

`server/game.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampMove, DEFAULT_SPAWN } from './game/movement.ts';
import { GameRoom } from './game/room.ts';

test('clampMove limita teleporte e bordas', () => {
  assert.deepEqual(clampMove({ x: 0, z: 0 }, 0.2, 0.2), { x: 0.2, z: 0.2 });
  const far = clampMove(DEFAULT_SPAWN, 500, 500);
  assert(Math.hypot(far.x - DEFAULT_SPAWN.x, far.z - DEFAULT_SPAWN.z) <= 1.5 + 1e-6, 'passo limitado');
  const oob = clampMove({ x: 23.6, z: 18.4 }, 999, 999);
  assert(oob.x <= 23.7 && oob.z <= 18.5, 'dentro dos limites');
});

test('GameRoom adiciona, move e remove jogador', () => {
  const room = new GameRoom();
  room.addPlayer({ id: 'a', username: 'ana', x: 0, z: 0, yaw: 0 });
  assert.equal(room.snapshotPlayers().length, 1);
  room.move('a', 0.5, 0.5, 0.5);
  assert.equal(room.snapshotPlayers()[0].x, 0.5);
  room.leave('a');
  assert.equal(room.snapshotPlayers().length, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run server:test`
Expected: FAIL — módulos `./game/movement.ts` / `./game/room.ts` inexistentes.

- [ ] **Step 3: Criar `server/game/movement.ts`**

```ts
export type Vec3 = { x: number; z: number; yaw?: number };

export const DEFAULT_SPAWN = { x: 0, z: 16.5, yaw: 0 };

// ponytail: validação leve (limites + anti-teleporte). Colisão fina continua no cliente.
const MAX_STEP = 1.5; // ~ sprint 6.1 * dt maior; folga generosa
const BOUNDS = { minX: -23.7, maxX: 23.7, minZ: -41.7, maxZ: 18.5 };

export function clampMove(from: Vec3, x: number, z: number) {
  let dx = x - from.x;
  let dz = z - from.z;
  const len = Math.hypot(dx, dz);
  if (len > MAX_STEP) {
    dx = (dx / len) * MAX_STEP;
    dz = (dz / len) * MAX_STEP;
  }
  return {
    x: Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, from.x + dx)),
    z: Math.min(BOUNDS.maxZ, Math.max(BOUNDS.minZ, from.z + dz)),
  };
}
```

- [ ] **Step 4: Criar `server/game/protocol.ts`**

```ts
import { z } from 'zod';

export const clientMsg = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), x: z.number(), z: z.number(), yaw: z.number() }),
  z.object({ type: z.literal('light'), roomId: z.string().max(8), on: z.boolean() }),
  z.object({ type: z.literal('plaque'), roomId: z.string().max(8), text: z.string().max(48) }),
]);
export type ClientMsg = z.infer<typeof clientMsg>;

export type NetPlayer = { id: string; username: string; x: number; z: number; yaw: number };
```

- [ ] **Step 5: Criar `server/game/room.ts`**

```ts
import { eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { playerPositions, roomState } from '../db/schema.ts';
import { clampMove, DEFAULT_SPAWN } from './movement.ts';
import type { NetPlayer } from './protocol.ts';

type Conn = { send: (data: string) => void };
type Member = NetPlayer & { conn: Conn };

export class GameRoom {
  players = new Map<string, Member>();
  sockets = new Map<Conn, string>();
  lights = new Map<string, boolean>();
  plaques = new Map<string, string>();

  addPlayer(p: NetPlayer, conn: Conn) {
    this.players.set(p.id, { ...p, conn });
    this.sockets.set(conn, p.id);
  }
  move(id: string, x: number, z: number, yaw: number) {
    const p = this.players.get(id);
    if (!p) return;
    const c = clampMove(p, x, z);
    p.x = c.x;
    p.z = c.z;
    p.yaw = yaw;
  }
  setLight(roomId: string, on: boolean) {
    this.lights.set(roomId, on);
  }
  setPlaque(roomId: string, text: string) {
    this.plaques.set(roomId, text);
  }
  leave(id: string) {
    const p = this.players.get(id);
    if (p) this.sockets.delete(p.conn);
    this.players.delete(id);
  }
  snapshotPlayers(): NetPlayer[] {
    return [...this.players.values()].map(({ conn: _c, ...p }) => p);
  }
  broadcast(data: unknown, except?: Conn) {
    const text = JSON.stringify(data);
    for (const [conn] of this.sockets)
      if (conn !== except) {
        try {
          conn.send(text);
        } catch {
          /* conexão morta; limpa no close */
        }
      }
  }
  async loadPlaques() {
    const rows = await db.select().from(roomState);
    for (const r of rows) this.plaques.set(r.roomId, r.plaqueText);
  }
  async loadSpawn(userId: string): Promise<{ x: number; z: number; yaw: number }> {
    const [pos] = await db.select().from(playerPositions).where(eq(playerPositions.userId, userId));
    return pos ? { x: pos.x, z: pos.z, yaw: pos.yaw } : { ...DEFAULT_SPAWN };
  }
  async savePosition(userId: string) {
    const p = this.players.get(userId);
    if (!p) return;
    const values = { userId, x: p.x, y: 0, z: p.z, yaw: p.yaw, updatedAt: new Date() };
    await db
      .insert(playerPositions)
      .values(values)
      .onConflictDoUpdate({ target: playerPositions.userId, set: values });
  }
  async saveAll() {
    for (const id of this.players.keys()) await this.savePosition(id);
  }
}
```

- [ ] **Step 6: Criar `server/ws.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from './db/client.ts';
import { users } from './db/schema.ts';
import { verifyToken } from './auth/tokens.ts';
import { clientMsg } from './game/protocol.ts';
import { GameRoom } from './game/room.ts';

const room = new GameRoom();
export { room };

export async function registerWs(app: FastifyInstance) {
  await room.loadPlaques();
  app.get('/ws', { websocket: true }, (socket, req) => {
    const url = new URL(req.url ?? '/ws', 'http://localhost');
    const token = url.searchParams.get('token') ?? '';
    let userId = '';
    let username = '';
    try {
      const payload = verifyToken(token);
      userId = payload.sub;
      username = payload.username;
    } catch {
      socket.send(JSON.stringify({ type: 'error', error: 'token inválido' }));
      socket.close();
      return;
    }

    void (async () => {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        socket.send(JSON.stringify({ type: 'error', error: 'usuário inexistente' }));
        socket.close();
        return;
      }
      const spawn = await room.loadSpawn(userId);
      const conn = { send: (d: string) => socket.send(d) };
      room.addPlayer({ id: userId, username, ...spawn }, conn);
      socket.send(
        JSON.stringify({
          type: 'welcome',
          spawn,
          players: room.snapshotPlayers(),
          plaques: Object.fromEntries(room.plaques),
          lights: Object.fromEntries(room.lights),
        }),
      );
      room.broadcast({ type: 'players', players: room.snapshotPlayers() }, conn);

      socket.on('message', (raw: Buffer) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.toString());
        } catch {
          return;
        }
        const msg = clientMsg.safeParse(parsed);
        if (!msg.success) return;
        const m = msg.data;
        if (m.type === 'move') {
          room.move(userId, m.x, m.z, m.yaw);
        } else if (m.type === 'light') {
          room.setLight(m.roomId, m.on);
          room.broadcast({ type: 'light', roomId: m.roomId, on: m.on });
        } else if (m.type === 'plaque') {
          room.setPlaque(m.roomId, m.text);
          room.broadcast({ type: 'plaque', roomId: m.roomId, text: m.text });
          void db
            .insert(roomState)
            .values({ roomId: m.roomId, plaqueText: m.text })
            .onConflictDoUpdate({ target: roomState.roomId, set: { plaqueText: m.text } });
        }
      });

      socket.on('close', () => {
        void room.savePosition(userId).finally(() => {
          room.leave(userId);
          room.broadcast({ type: 'players', players: room.snapshotPlayers() });
        });
      });
    })();
  });
}
```

- [ ] **Step 7: Ligar WS no `server/index.ts`**

Adicionar:
```ts
import websocket from '@fastify/websocket';
import { registerWs, room } from './ws.ts';
// ...
await app.register(websocket);
await app.register(registerWs);
setInterval(() => void room.saveAll(), 2000);
```

- [ ] **Step 8: Rodar o teste e ver passar**

Run: `npm run server:test`
Expected: PASS (`pass 2`).

- [ ] **Step 9: Verificar tipos**

Run: `npm run server:build`
Expected: sem erros.

- [ ] **Step 10: Commit**

```bash
git add server
git commit -m "feat(server): presenca, protocolo ws, spawn e persistencia de posicao"
```

---

### Task 4: Cliente WS + tela de login (front)

**Files:**
- Create: `app/game/net.ts`
- Create: `app/api.ts`
- Modify: `app/page.tsx`
- Modify: `app/globals.css` (estilos de login) — adicionar no final.

**Interfaces:**
- Consumes: `ws://192.64.85.57:3001`, `POST /auth/register|login`.
- Produces:
  - `class Net` com `connect(token)`, `move(x,z,yaw)`, `light(id,on)`, `plaque(id,text)`, callbacks `onPlayers`, `onLight`, `onPlaque`, `onWelcome`, `onStatus`.
  - `api.register(username,password)`, `api.login(...)`, `api.token()`, `api.username()`, `api.logout()`, `api.files(computerId)`, `api.saveFile(...)`, `api.deleteFile(...)` (em Task 7).

- [ ] **Step 1: Criar `app/api.ts`**

```ts
const BASE = 'http://192.64.85.57:3001';
const TOKEN_KEY = 'meridian_token';
const USER_KEY = 'meridian_user';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'erro de rede');
  return data as T;
}

export const api = {
  token: () => localStorage.getItem(TOKEN_KEY),
  username: () => localStorage.getItem(USER_KEY),
  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  async auth(kind: 'register' | 'login', username: string, password: string) {
    const data = await post<{ token: string; username: string }>(`/auth/${kind}`, { username, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, data.username);
    return data;
  },
  async authed<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${this.token()}`,
        ...(init.headers ?? {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? 'erro de rede');
    return data as T;
  },
};
```

- [ ] **Step 2: Criar `app/game/net.ts`**

```ts
export type NetPlayer = { id: string; username: string; x: number; z: number; yaw: number };
export type Welcome = {
  spawn: { x: number; z: number; yaw: number };
  players: NetPlayer[];
  plaques: Record<string, string>;
  lights: Record<string, boolean>;
};

const WS_URL = 'ws://192.64.85.57:3001/ws';

export class Net {
  ws: WebSocket | null = null;
  online = false;
  fails = 0;
  onPlayers: (p: NetPlayer[]) => void = () => {};
  onLight: (roomId: string, on: boolean) => void = () => {};
  onPlaque: (roomId: string, text: string) => void = () => {};
  onWelcome: (w: Welcome) => void = () => {};
  onStatus: (online: boolean) => void = () => {};

  connect(token: string) {
    try {
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      this.ws = ws;
      ws.onopen = () => {
        this.fails = 0;
        this.online = true;
        this.onStatus(true);
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string) as { type: string } & Record<string, unknown>;
        if (msg.type === 'welcome') this.onWelcome(msg as unknown as Welcome);
        else if (msg.type === 'players') this.onPlayers(msg.players as NetPlayer[]);
        else if (msg.type === 'light') this.onLight(msg.roomId as string, msg.on as boolean);
        else if (msg.type === 'plaque') this.onPlaque(msg.roomId as string, msg.text as string);
      };
      ws.onclose = () => {
        this.online = false;
        this.onStatus(false);
        if (this.fails++ < 3) setTimeout(() => this.connect(token), 800 * this.fails);
      };
      ws.onerror = () => ws.close();
    } catch {
      this.online = false;
      this.onStatus(false);
    }
  }
  private send(type: string, payload: Record<string, unknown>) {
    if (this.online && this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ type, ...payload }));
  }
  move(x: number, z: number, yaw: number) { this.send('move', { x, z, yaw }); }
  light(roomId: string, on: boolean) { this.send('light', { roomId, on }); }
  plaque(roomId: string, text: string) { this.send('plaque', { roomId, text }); }
  close() { this.fails = 999; this.ws?.close(); }
}
```

- [ ] **Step 3: Escrever o teste de browser que falha**

Em `verify-browser.mjs`, adicionar um bloco que: abre a página, preenche usuário/senha, clica entrar, espera o HUD `[data-testid="hud-players"]`. (Se `verify-browser.mjs` ainda não existe com esse fluxo, criar `verify-login.mjs` separado seguindo o mesmo padrão Playwright dos outros: launch chromium `--enable-unsafe-swiftshader`, `page.goto('http://localhost:5173')`.)

- [ ] **Step 4: Rodar e ver falhar**

Run: `npm run dev` (outro terminal) e `node verify-login.mjs`
Expected: FAIL — seletor de login não existe.

- [ ] **Step 5: Adicionar a tela de login no `app/page.tsx`**

Novos estados:
```tsx
const [username, setUsername] = useState('');
const [password, setPassword] = useState('');
const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
const [authBusy, setAuthBusy] = useState(false);
const [authError, setAuthError] = useState('');
const [session, setSession] = useState<{ token: string; username: string } | null>(null);
const net = useRef<import('./game/net').Net | null>(null);
```
`useEffect` de boot (substituir o `useEffect` de import do engine por um que, após criar `Game`, carrega `api.token()` + `api.username()` e faz `setSession`):
```tsx
useEffect(() => {
  const token = api.token();
  const name = api.username();
  if (token && name) setSession({ token, username: name });
}, []);
```
Componente de login, renderizado antes do menu quando `!session`:
```tsx
{!session && (
  <section className="login-panel" data-testid="login">
    <h1>{authMode === 'login' ? 'ENTRAR' : 'CRIAR CONTA'}</h1>
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setAuthBusy(true);
        setAuthError('');
        try {
          const { token, username: name } = await api.auth(authMode, username, password);
          setSession({ token, username: name });
        } catch (err) {
          setAuthError(err instanceof Error ? err.message : 'falha no login');
        } finally {
          setAuthBusy(false);
        }
      }}
    >
      <label>
        Usuário
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={24} />
      </label>
      <label>
        Senha
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} required minLength={4} />
      </label>
      {authError && <p className="login-error">{authError}</p>}
      <button className="deploy-button" disabled={authBusy}>
        {authBusy ? 'CONECTANDO…' : authMode === 'login' ? 'ENTRAR' : 'CRIAR CONTA'}
      </button>
      <button type="button" className="link-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
        {authMode === 'login' ? 'Criar conta' : 'Já tenho conta'}
      </button>
    </form>
  </section>
)}
```
Esconder o menu de missão enquanto `!session`: mudar a condição para `!active && !settings && !state.desktop && session`.

- [ ] **Step 6: Estilos de login no fim de `app/globals.css`**

```css
.login-panel {
  position: fixed; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 1rem; z-index: 40;
  background: radial-gradient(circle at 50% 30%, #1c2a30, #0b0f12 70%);
  color: #e8ece9; font-family: inherit;
}
.login-panel form { display: flex; flex-direction: column; gap: 0.75rem; width: min(320px, 80vw); }
.login-panel label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; }
.login-panel input { padding: 0.6rem 0.7rem; background: #10171b; border: 1px solid #2b3a40; color: #e8ece9; border-radius: 4px; }
.login-error { color: #ff8a7a; font-size: 0.8rem; }
.link-button { background: none; border: none; color: #7fd6c2; cursor: pointer; font-size: 0.8rem; }
```

- [ ] **Step 7: Adicionar dependência de import do `api` no `page.tsx`**

```tsx
import { api } from './api';
```

- [ ] **Step 8: Rodar o teste de browser e ver passar**

Run: `node verify-login.mjs`
Expected: PASS — após submit, `[data-testid="login"]` some e o menu aparece.

- [ ] **Step 9: Rodar testes do front**

Run: `npm test`
Expected: PASS (verify-world/movement/graphics inalterados).

- [ ] **Step 10: Commit**

```bash
git add app package.json
git commit -m "feat(front): cliente ws, api e tela de login/registro"
```

---

### Task 5: HUD (FPS + quem está na sala), avatares remotos e spawn

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/game/engine.ts`
- Modify: `app/game/environment.ts` (adiciona `roomId` a salas e notebooks)
- Test: `verify-world.mjs` (inalterado) + `verify-browser.mjs` (adicionar checagem de HUD)

**Interfaces:**
- Consumes: `Net`, `Welcome`, `NetPlayer`.
- Produces:
  - `env.rooms[].roomId: string`, `env.notebooks[].roomId: string` (`W1..W3`,`E1..E3`).
  - `Game.notebookTarget: { x: number; y: number; z: number; roomId: string } | null`
  - `setRemotePlayers(players: { id: string; username: string; x: number; z: number; yaw: number }[]): void`
  - `spawnAt(x: number, z: number, yaw: number): void`
  - `onLocalMove: ((x: number, z: number, yaw: number) => void) | null`
  - `onToggleLight: ((roomId: string, on: boolean) => void) | null`
  - `applyLight(roomId: string, on: boolean): void`
  - `applyPlaque(roomId: string, text: string): void`

- [ ] **Step 1: Adicionar `roomId` a salas e notebooks (`app/game/environment.ts`)**

No topo do loop de salas, definir os ids estáveis e anexá-los. O loop atual é `for (const side of [-1, 1]) { for (const center of roomCenters) { ... } }`. Trocar por índices explícitos:
```ts
const ROOM_IDS = ['W1', 'W2', 'W3', 'E1', 'E2', 'E3'];
// ...
for (const side of [-1, 1]) {
  for (let ri = 0; ri < roomCenters.length; ri++) {
    const center = roomCenters[ri];
    const roomId = ROOM_IDS[side === 1 ? ri + 3 : ri];
    // ... resto do corpo inalterado ...
```
No `rooms.push({ ... })` adicionar `roomId,` e no `notebooks.push({ ... })` adicionar `roomId,`. Atualizar os tipos (linhas 23-32) para incluir `roomId: string`.

- [ ] **Step 2: Adicionar campos e métodos no `Game` (`app/game/engine.ts`)**

Após a linha de `notebookTarget` (linha ~111):
```ts
remoteGroup = new THREE.Group();
remotes = new Map<string, THREE.Group>();
remoteTargets = new Map<string, { x: number; z: number; yaw: number }>();
onLocalMove: ((x: number, z: number, yaw: number) => void) | null = null;
onToggleLight: ((roomId: string, on: boolean) => void) | null = null;
netClock = 0;
desktopRoomId: string | null = null;
```
Alterar o tipo do campo `notebookTarget` (linha 111) para `{ x: number; y: number; z: number; roomId: string } | null`.
No construtor, adicionar `this.scene.add(this.remoteGroup);` logo após `this.env = createEnvironment(...)`.
Em `enterDesktop()`, adicionar `this.desktopRoomId = this.notebookTarget?.roomId ?? null;` e em `exitDesktop()`, `this.desktopRoomId = null;`.

Adicionar métodos (antes de `enterDesktop()`):
```ts
makeRemote(username: string) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.1, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x35506b, roughness: 0.7 }),
  );
  body.position.y = 0.9;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.28, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xd9b48c, roughness: 0.6 }),
  );
  head.position.y = 1.62;
  g.add(body, head);
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0b0f12'; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#7fd6c2'; ctx.font = '32px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(username.slice(0, 12), 128, 42);
  const tex = new THREE.CanvasTexture(canvas);
  const tag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.28),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  tag.position.y = 2.05;
  g.add(tag);
  g.userData.tag = tag;
  return g;
}
setRemotePlayers(players: { id: string; username: string; x: number; z: number; yaw: number }[]) {
  const seen = new Set<string>();
  for (const p of players) {
    seen.add(p.id);
    this.remoteTargets.set(p.id, { x: p.x, z: p.z, yaw: p.yaw });
    if (!this.remotes.has(p.id)) {
      const g = this.makeRemote(p.username);
      this.remotes.set(p.id, g);
      this.remoteGroup.add(g);
      g.position.set(p.x, 0, p.z);
    }
  }
  for (const [id, g] of this.remotes)
    if (!seen.has(id)) {
      this.remoteGroup.remove(g);
      this.remotes.delete(id);
      this.remoteTargets.delete(id);
    }
}
updateRemotes(dt: number) {
  const k = 1 - Math.exp(-dt * 10);
  for (const [id, g] of this.remotes) {
    const t = this.remoteTargets.get(id);
    if (!t) continue;
    g.position.x += (t.x - g.position.x) * k;
    g.position.z += (t.z - g.position.z) * k;
    const tag = g.userData.tag as THREE.Mesh | undefined;
    if (tag) tag.quaternion.copy(this.camera.quaternion);
  }
}
spawnAt(x: number, z: number, yaw: number) {
  this.camera.position.set(x, 1.7, z);
  this.yaw = yaw;
  this.pitch = 0;
}
applyLight(roomId: string, on: boolean) {
  const r = this.env.rooms.find((room) => room.roomId === roomId);
  if (!r) return;
  r.on = on;
  r.light.visible = on;
  (r.led.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 1.6 : 0;
}
applyPlaque(roomId: string, text: string) {
  this.env.plaques.find((p) => p.roomId === roomId)?.setText(text);
}
```

- [ ] **Step 3: Enviar `move` throttled e atualizar remotos no loop**

No `animate`, logo após `this.updateRooms();`:
```ts
this.updateRemotes(dt);
this.netClock -= dt;
if (this.state.mode === 'playing' && this.netClock <= 0) {
  this.netClock = 1 / 15;
  this.onLocalMove?.(this.camera.position.x, this.camera.position.z, this.yaw);
}
```

- [ ] **Step 4: Luz por clique e por E chamando o servidor**

Em `bind()`, no handler `keydown`, no bloco `if (e.code === 'KeyE' ...)` o `else this.toggleTargetRoom();` continua. Alterar `mousedown` para também tratar luz:
```ts
this.listen('mousedown', (e) => {
  this.lastMouse = { x: e.clientX, y: e.clientY };
  if (e.button !== 0 || this.state.mode !== 'playing') return;
  if (this.notebookTarget) this.enterDesktop();
  else if (this.target) this.toggleTargetRoom();
});
```
Alterar `toggleTargetRoom()` para não alternar localmente, e sim avisar o servidor (o servidor faz broadcast e `applyLight` aplica):
```ts
toggleTargetRoom() {
  const r = this.target;
  if (!r) return;
  if (this.onToggleLight) this.onToggleLight(r.roomId, !r.on);
  else this.applyLight(r.roomId, !r.on);
  this.sound.noise(0.05, 0.1, 900);
}
```

- [ ] **Step 5: Ligar o `Net` no `page.tsx` e HUD**

Novos estados:
```tsx
const [players, setPlayers] = useState<import('./game/net').NetPlayer[]>([]);
const [netOnline, setNetOnline] = useState(true);
const [welcome, setWelcome] =
  useState<import('./game/net').Welcome | null>(null);
const [desktopRoom, setDesktopRoom] = useState<string | null>(null);
```
`useEffect` que conecta quando `session` existe:
```tsx
useEffect(() => {
  if (!session) return;
  let disposed = false;
  void import('./game/net').then(({ Net }) => {
    if (disposed) return;
    const n = new Net();
    net.current = n;
    n.onStatus = (online) => setNetOnline(online);
    n.onPlayers = setPlayers;
    n.onWelcome = (w) => {
      setWelcome(w);
      engine.current?.setRemotePlayers(w.players);
      for (const [roomId, text] of Object.entries(w.plaques))
        engine.current?.applyPlaque(roomId, text);
      for (const [roomId, on] of Object.entries(w.lights))
        engine.current?.applyLight(roomId, on);
    };
    n.onPlaque = (roomId, text) => engine.current?.applyPlaque(roomId, text);
    n.onLight = (roomId, on) => engine.current?.applyLight(roomId, on);
    n.connect(session.token);
    if (engine.current) {
      engine.current.onLocalMove = (x, z, yaw) => n.move(x, z, yaw);
      engine.current.onToggleLight = (roomId, on) => n.light(roomId, on);
    }
  });
  return () => {
    disposed = true;
    net.current?.close();
    net.current = null;
  };
}, [session, ready]);
```
No `start()`, aplicar o spawn do servidor:
```tsx
const start = () => {
  setSettings(false);
  const s = welcome?.spawn;
  if (s) engine.current?.spawnAt(s.x, s.z, s.yaw);
  engine.current?.start();
};
```
Capturar o notebook aberto: no `useEffect` que observa `state.desktop`, quando `state.desktop` fica true, fazer `setDesktopRoom(engine.current?.desktopRoomId ?? null)`; quando fica false, `setDesktopRoom(null)`.

HUD, renderizar quando `active`:
```tsx
{active && (
  <div className="hud-players" data-testid="hud-players">
    <span className="hud-dot" /> {players.length} NA SALA
    <ul>
      {players.map((p) => (
        <li key={p.id}>{p.username}</li>
      ))}
    </ul>
    {!netOnline && <em>modo solo</em>}
  </div>
)}
{active && (
  <div className="hud-fps" data-testid="hud-fps">{state.fps} FPS</div>
)}
```

- [ ] **Step 6: Estilos do HUD no fim de `app/globals.css`**

```css
.hud-players {
  position: fixed; top: 84px; left: 16px; z-index: 30;
  font-family: inherit; color: #dfe6e2; font-size: 0.75rem; letter-spacing: 0.08em;
  background: rgba(10, 15, 18, 0.55); padding: 0.5rem 0.7rem; border-radius: 4px;
  border: 1px solid rgba(127, 214, 194, 0.25);
}
.hud-players ul { list-style: none; margin: 0.4rem 0 0; padding: 0; }
.hud-players li { color: #9fb3ac; text-transform: none; letter-spacing: 0.02em; }
.hud-players em { color: #ffb36b; font-style: normal; }
.hud-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #7fd6c2; }
.hud-fps {
  position: fixed; top: 84px; right: 16px; z-index: 30; color: #7fd6c2;
  font-family: monospace; font-size: 0.8rem;
  background: rgba(10, 15, 18, 0.55); padding: 0.35rem 0.6rem; border-radius: 4px;
}
```

- [ ] **Step 7: Rodar testes do front + build**

Run: `npm test` e `npm run build`
Expected: PASS / sem erros.

- [ ] **Step 8: Teste browser do HUD**

Run: `node verify-browser.mjs` (com dev server ligado)
Expected: PASS — `[data-testid="hud-fps"]` contém `FPS`.

- [ ] **Step 9: Commit**

```bash
git add app
git commit -m "feat(front): hud de fps e presenca, avatares remotos e spawn do servidor"
```

---

### Task 6: Sala de spawn + porta generalizada + placas de LED

**Files:**
- Modify: `app/game/environment.ts`
- Modify: `app/game/engine.ts` (doorBlocked por eixo)
- Test: `verify-world.mjs`

**Interfaces:**
- Produces (no retorno de `createEnvironment`):
  - `rooms[].roomId: string` (`W1..W3`,`E1..E3`)
  - `notebooks[].roomId: string`
  - `doors[].plane: 'x' | 'z'`
  - `plaques: { roomId: string; x: number; y: number; z: number; setText(t: string): void }[]`
  - `spawnPoints` (inalterado: 6 posições de mesa) + `spawn: { x: 0, z: 16.5, yaw: 0 }`
  - constante `ROOM_IDS = ['W1','W2','W3','E1','E2','E3']`

- [ ] **Step 1: Atualizar o teste que define o novo contrato**

Em `verify-world.mjs`, substituir as asserções de topo por:
```js
assert.equal(env.spawnPoints.length, 6, 'six desk points');
assert.equal(env.doors.length, 7, 'six room doors + spawn door');
assert.equal(env.rooms.length, 6, 'six switchable rooms');
assert.equal(env.plaques.length, 6, 'six led plaques');
assert.deepEqual(
  env.rooms.map((r) => r.roomId),
  ['W1', 'W2', 'W3', 'E1', 'E2', 'E3'],
  'stable room ids',
);
for (const r of env.rooms) assert(r.switch && r.light && r.led && r.roomId, 'room completo');
assert.equal(env.spawn.x, 0, 'spawn x');
env.plaques[0].setText('SALA TESTE');
assert(env.colliders.length > 0, 'office has walls');
```
E após o loop de corredor, adicionar:
```js
// sala de spawn livre no centro e fechada nas laterais
assert(!blocked(0, 16.5), 'spawn room center clear');
assert(blocked(2, 16.5), 'spawn room east wall');
assert(blocked(-2, 16.5), 'spawn room west wall');
assert(blocked(0, 18.4), 'spawn room north wall');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `env.plaques` undefined / `doors.length` 6.

- [ ] **Step 3: Generalizar porta em `environment.ts`**

No tipo `doors`, adicionar `plane: 'x' | 'z'`. Nos pushes existentes (linha ~212) adicionar `plane: 'x'`. Após o loop `for (const side...)` (antes do flush de InstancedMesh, linha ~294), adicionar a porta da sala de spawn:
```ts
// --- Sala de spawn (norte do corredor), porta de frente para o corredor ---
const spawnZ = 16.6;
const spawnHalf = 2;
const spawnDoorHalf = doorHalf;
// paredes laterais e fundo
box(corridorWallMat, -spawnHalf, ceilingHeight / 2, spawnZ, 0.3, ceilingHeight, 4.2);
box(corridorWallMat, spawnHalf, ceilingHeight / 2, spawnZ, 0.3, ceilingHeight, 4.2);
box(corridorWallMat, 0, ceilingHeight / 2, spawnZ + 2.1, 2 * spawnHalf + 0.3, ceilingHeight, 0.3);
collider(-spawnHalf, spawnZ, 0.3, 4.2);
collider(spawnHalf, spawnZ, 0.3, 4.2);
collider(0, spawnZ + 2.1, 2 * spawnHalf + 0.3, 0.3);
// parede sul (z=14.3) com vão central para a porta
const wallZ = roomCenters[0] + roomWidth / 2 + 1.8; // 14.3
const segW = (2 * spawnHalf - spawnDoorHalf * 2) / 2;
box(corridorWallMat, -spawnDoorHalf - segW / 2, ceilingHeight / 2, wallZ, segW, ceilingHeight, 0.3);
box(corridorWallMat, spawnDoorHalf + segW / 2, ceilingHeight / 2, wallZ, segW, ceilingHeight, 0.3);
collider(-spawnDoorHalf - segW / 2, wallZ, segW, 0.3);
collider(spawnDoorHalf + segW / 2, wallZ, segW, 0.3);
box(frameMat, 0, panelH + (ceilingHeight - panelH) / 2, wallZ, spawnDoorHalf * 2, ceilingHeight - panelH, 0.12);
// porta de madeira (plano z) girando em y
const spawnPivot = new THREE.Group();
spawnPivot.position.set(-spawnDoorHalf, 0, wallZ);
const spawnLeaf = new THREE.Mesh(unitBox, woodMat);
spawnLeaf.scale.set(spawnDoorHalf * 2, panelH, 0.06);
spawnLeaf.position.set(spawnDoorHalf, panelH / 2, 0);
const spawnHandle = new THREE.Mesh(unitBox, handleMat);
spawnHandle.scale.set(0.16, 0.05, 0.03);
spawnHandle.position.set(spawnDoorHalf * 2 - 0.22, 1.05, 0.06);
spawnPivot.add(spawnLeaf, spawnHandle);
scene.add(spawnPivot);
doors.push({ group: spawnPivot, x: 0, z: wallZ, side: 1, half: spawnDoorHalf, plane: 'z' });
```

- [ ] **Step 4: Adicionar as placas de LED em `environment.ts`**

Antes do loop `for (const side ...)` (linha ~159), adicionar (`ROOM_IDS` já foi criado em Task 5):
```ts
const plaques: {
  roomId: string;
  text: string;
  x: number; y: number; z: number;
  setText(t: string): void;
}[] = [];
const makePlaque = (roomId: string, x: number, y: number, z: number, rotY: number) => {
  let ctx: CanvasRenderingContext2D | null = null;
  let mat: ThreeType.MeshMaterial;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    mat = new THREE.MeshBasicMaterial({ map: tex });
  } else {
    mat = new THREE.MeshBasicMaterial({ color: 0x0b3d2e });
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.4), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  scene.add(mesh);
  const entry = {
    roomId,
    text: '',
    x, y, z,
    setText(t: string) {
      entry.text = t;
      if (!ctx) return;
      ctx.fillStyle = '#04120d'; ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#5cffb0'; ctx.font = 'bold 30px monospace';
      ctx.textAlign = 'center'; ctx.fillText(t.slice(0, 14).toUpperCase(), 128, 42);
      const m = mat as ThreeType.MeshBasicMaterial;
      if (m.map) m.map.needsUpdate = true;
    },
  };
  plaques.push(entry);
  return entry;
};
```
Dentro do loop de salas, após `notebooks.push({ ... roomId })`, adicionar a placa na face da sala voltada ao corredor:
```ts
makePlaque(roomId, side * (halfCorridor - 0.04), 1.6, center + doorHalf + 1.0, side === 1 ? -Math.PI / 2 : Math.PI / 2);
```
No `return` de `createEnvironment`, adicionar `plaques` e `spawn: { x: 0, z: 16.5, yaw: 0 }`.

- [ ] **Step 5: Ajustar tipos de `doors` em `environment.ts`**

Adicionar `plane: 'x' | 'z'` ao tipo de `doors` (linhas 16-22). Nos pushes existentes (linha ~212) adicionar `plane: 'x'`.

- [ ] **Step 6: Tratar o eixo da porta no `engine.ts`**

Em `doorBlocked` (linhas 322-330), substituir o corpo:
```ts
doorBlocked(x: number, z: number, r: number, feet: number) {
  if (feet > 0.5) return false;
  for (const d of this.env.doors) {
    if (Math.abs(d.group.rotation.y) > 0.4) continue;
    if (d.plane === 'z') {
      if (Math.abs(z - d.z) < r + 0.08 && Math.abs(x - d.x) < d.half + r) return true;
    } else if (Math.abs(x - d.x) < r + 0.08 && Math.abs(z - d.z) < d.half + r) return true;
  }
  return false;
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npm test`
Expected: PASS (verify-world com 7 portas, 6 placas, sala de spawn).

- [ ] **Step 8: Build e lint**

Run: `npm run build` e `npm run lint`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add app/game/environment.ts app/game/engine.ts verify-world.mjs
git commit -m "feat(world): sala de spawn com porta e placas de led por sala"
```

---

### Task 7: Computadores — API de arquivos + bloco de notas + calculadora

**Files:**
- Create: `server/game/files.ts` (rotas REST autenticadas)
- Modify: `server/index.ts`
- Create: `app/game/desktop.tsx` (apps: Notepad, Calculator)
- Modify: `app/page.tsx` (usar `desktop.tsx` no overlay XP)
- Modify: `app/globals.css`
- Test: `server/files.test.ts`

**Interfaces:**
- Consumes: `pool`/`db`, `computerFiles`, `verifyToken`.
- Produces:
  - `requireAuth(req, reply)` (preHandler que valida `Authorization: Bearer`).
  - Rotas: `GET /files?computer=`, `POST /files`, `PUT /files/:id`, `DELETE /files/:id`.
  - Componentes React: `<Notepad computerId={string} api={api} />`, `<Calculator />`.

- [ ] **Step 1: Escrever o teste que falha**

`server/files.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './db/client.ts';

test('schema de arquivos aceita e limita por computador', async () => {
  const computer = `T${Date.now()}`;
  await pool.query(
    `INSERT INTO computer_files (computer_id, name, content) VALUES ($1, $2, $3)`,
    [computer, 'a.txt', 'ola'],
  );
  const dup = await pool
    .query(`INSERT INTO computer_files (computer_id, name) VALUES ($1, $2)`, [computer, 'a.txt'])
    .then(() => null)
    .catch((e) => e);
  assert.ok(dup, 'nome repetido no mesmo computador falha');
  const other = await pool.query(
    `INSERT INTO computer_files (computer_id, name) VALUES ($1, $2) RETURNING id`,
    [`${computer}x`, 'a.txt'],
  );
  assert.ok(other.rows[0].id, 'mesmo nome em outro computador é permitido');
  await pool.query('DELETE FROM computer_files WHERE computer_id LIKE $1', [`${computer}%`]);
});
```

- [ ] **Step 2: Rodar e ver passar (a tabela já existe de Task 1)**

Run: `npm run server:test`
Expected: PASS.

- [ ] **Step 3: Criar `server/game/files.ts`**

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { computerFiles } from '../db/schema.ts';
import { verifyToken } from '../auth/tokens.ts';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    verifyToken(token);
  } catch {
    return reply.code(401).send({ error: 'não autenticado' });
  }
}

export async function registerFileRoutes(app: FastifyInstance) {
  app.get('/files', { preHandler: requireAuth }, async (req, reply) => {
    const computer = z.string().max(8).safeParse((req.query as { computer?: string }).computer);
    if (!computer.success) return reply.code(400).send({ error: 'computer inválido' });
    const files = await db.select().from(computerFiles).where(eq(computerFiles.computerId, computer.data));
    return { files };
  });

  app.post('/files', { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ computer: z.string().max(8), name: z.string().min(1).max(32), content: z.string().max(20000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'dados inválidos' });
    const { computer, name, content } = body.data;
    const existing = await db.select().from(computerFiles).where(and(eq(computerFiles.computerId, computer), eq(computerFiles.name, name)));
    if (existing.length) return reply.code(409).send({ error: 'arquivo já existe' });
    const [file] = await db.insert(computerFiles).values({ computerId: computer, name, content }).returning();
    return { file };
  });

  app.put('/files/:id', { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    const body = z.object({ name: z.string().min(1).max(32).optional(), content: z.string().max(20000).optional() }).safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: 'dados inválidos' });
    const set = { ...body.data, updatedAt: new Date() };
    const [file] = await db.update(computerFiles).set(set).where(eq(computerFiles.id, id.data)).returning();
    if (!file) return reply.code(404).send({ error: 'arquivo não encontrado' });
    return { file };
  });

  app.delete('/files/:id', { preHandler: requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: 'id inválido' });
    await db.delete(computerFiles).where(eq(computerFiles.id, id.data));
    return { ok: true };
  });
}
```

- [ ] **Step 4: Registrar rotas no `server/index.ts`**

```ts
import { registerFileRoutes } from './game/files.ts';
// após registerAuthRoutes:
await app.register(registerFileRoutes);
```

- [ ] **Step 5: Criar `app/game/desktop.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

type FileRow = { id: string; computerId: string; name: string; content: string };

export function Notepad({ computerId }: { computerId: string }) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const saveTimer = useRef(0);
  const load = useCallback(async () => {
    try {
      const { files: rows } = await api.authed<{ files: FileRow[] }>(`/files?computer=${computerId}`);
      setFiles(rows);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'erro ao carregar');
    }
  }, [computerId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!activeId) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await api.authed(`/files/${activeId}`, { method: 'PUT', body: JSON.stringify({ content: draft }) });
        setStatus('salvo');
      } catch (e) {
        setStatus(e instanceof Error ? e.message : 'erro ao salvar');
      }
    }, 800);
    return () => window.clearTimeout(saveTimer.current);
  }, [draft, activeId]);
  const create = async () => {
    const name = prompt('Nome do arquivo');
    if (!name) return;
    try {
      const { file } = await api.authed<{ file: FileRow }>('/files', {
        method: 'POST',
        body: JSON.stringify({ computer: computerId, name, content: '' }),
      });
      await load();
      setActiveId(file.id);
      setDraft('');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'erro ao criar');
    }
  };
  const open = (f: FileRow) => { setActiveId(f.id); setDraft(f.content); };
  const remove = async (id: string) => {
    await api.authed(`/files/${id}`, { method: 'DELETE' }).catch(() => {});
    if (activeId === id) { setActiveId(null); setDraft(''); }
    void load();
  };
  return (
    <div className="xp-app">
      <div className="xp-app-bar">Bloco de notas — {computerId}</div>
      <button type="button" onClick={create}>+ Novo arquivo</button>
      <ul className="xp-files">
        {files.length === 0 && <li className="xp-empty">nenhum arquivo</li>}
        {files.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => open(f)}>{f.name}</button>
            <button type="button" aria-label={`excluir ${f.name}`} onClick={() => remove(f.id)}>✕</button>
          </li>
        ))}
      </ul>
      {activeId && (
        <>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} aria-label="conteúdo do arquivo" />
          <small>{status}</small>
        </>
      )}
    </div>
  );
}

export function Calculator() {
  const [value, setValue] = useState('0');
  const press = (k: string) => {
    if (k === 'C') return setValue('0');
    if (k === '=') {
      try {
        const safe = value.replace(/[^0-9+\-*/.() ]/g, '');
        setValue(String(Function(`return (${safe})`)()));
      } catch { setValue('erro'); }
      return;
    }
    setValue(value === '0' ? k : value + k);
  };
  return (
    <div className="xp-app">
      <div className="xp-app-bar">Calculadora</div>
      <output className="xp-calc-screen">{value}</output>
      <div className="xp-calc-keys">
        {['7','8','9','/','4','5','6','*','1','2','3','-','0','.','C','+'].map((k) => (
          <button type="button" key={k} onClick={() => press(k)}>{k}</button>
        ))}
        <button type="button" onClick={() => press('=')}>=</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Usar os apps no overlay XP de `page.tsx`**

Importar:
```tsx
import { Notepad, Calculator } from './game/desktop';
const [xpApp, setXpApp] = useState<'home' | 'notepad' | 'calc'>('home');
```
Dentro do `<dialog className="xp" open>` substituir os `.xp-icons` por ícones que abrem apps e renderizar o app ativo:
```tsx
<div className="xp-icons">
  <button type="button" onClick={() => setXpApp('notepad')}><span aria-hidden="true">📝</span>Bloco de notas</button>
  <button type="button" onClick={() => setXpApp('calc')}><span aria-hidden="true">🧮</span>Calculadora</button>
  <button type="button" onClick={() => setXpApp('home')}><span aria-hidden="true">🖥</span>Área de trabalho</button>
</div>
{xpApp === 'notepad' && desktopRoom && <Notepad computerId={desktopRoom} />}
{xpApp === 'calc' && <Calculator />}
```
No `exitDesktop`/“Encerrar sessão”, resetar `setXpApp('home')`.

- [ ] **Step 7: Estilos dos apps no fim de `app/globals.css`**

```css
.xp-app {
  position: absolute; top: 60px; left: 60px; width: min(420px, 70vw);
  background: #ece9d8; color: #111; border: 2px solid #0a246a; padding: 0.6rem;
  font-family: Tahoma, sans-serif; font-size: 0.85rem; z-index: 5;
}
.xp-app-bar { background: linear-gradient(#0a246a, #3a6ea5); color: #fff; padding: 0.3rem 0.5rem; margin: -0.6rem -0.6rem 0.6rem; font-weight: bold; }
.xp-files { list-style: none; margin: 0 0 0.5rem; padding: 0; max-height: 140px; overflow: auto; }
.xp-files li { display: flex; gap: 0.4rem; align-items: center; }
.xp-files button { text-align: left; flex: 1; }
.xp-empty { color: #666; }
.xp-app textarea { width: 100%; box-sizing: border-box; font-family: 'Lucida Console', monospace; }
.xp-calc-screen { display: block; background: #c8d8c0; border: 1px inset #888; text-align: right; padding: 0.4rem; font-family: monospace; font-size: 1.2rem; margin-bottom: 0.4rem; }
.xp-calc-keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.xp-calc-keys button { padding: 0.5rem; }
```

- [ ] **Step 8: Rodar testes, build e lint**

Run: `npm run server:test`, `npm test`, `npm run build`, `npm run lint`
Expected: tudo PASS / sem erros.

- [ ] **Step 9: Commit**

```bash
git add server app
git commit -m "feat: arquivos por computador, bloco de notas e calculadora"
```

---

### Task 8: App da placa no notebook + luz por clique replicada

**Files:**
- Modify: `app/game/desktop.tsx` (componente `PlaqueEditor`)
- Modify: `app/page.tsx`
- Modify: `app/game/engine.ts` (expor `notebookTarget.roomId` — já existe no tipo após Task 6)
- Test: `verify-browser.mjs`

**Interfaces:**
- Consumes: `net.plaque(roomId,text)`, `engine.applyPlaque`, `engine.onToggleLight`.
- Produces: `<PlaqueEditor roomId={string} onSave={(text)=>void} />`.

- [ ] **Step 1: Adicionar `PlaqueEditor` em `app/game/desktop.tsx`**

```tsx
export function PlaqueEditor({ roomId, initial, onSave }: { roomId: string; initial: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial]);
  return (
    <div className="xp-app">
      <div className="xp-app-bar">Placa da sala — {roomId}</div>
      <label>
        Nome exibido no LED
        <input value={text} maxLength={14} onChange={(e) => setText(e.target.value)} />
      </label>
      <button type="button" onClick={() => onSave(text)}>Aplicar</button>
      <small>até 14 caracteres</small>
    </div>
  );
}
```

- [ ] **Step 2: Integrar no `page.tsx`**

Manter um estado `plaquesText: Record<string,string>` atualizado por `net.onPlaque` e `welcome.plaques`. No overlay XP, adicionar botão e app:
```tsx
<button type="button" onClick={() => setXpApp('plaque')}><span aria-hidden="true">🪧</span>Placa da sala</button>
```
```tsx
{xpApp === 'plaque' && desktopRoom && (
  <PlaqueEditor
    roomId={desktopRoom}
    initial={plaquesText[desktopRoom] ?? ''}
    onSave={(text) => net.current?.plaque(desktopRoom, text)}
  />
)}
```
Alterar `xpApp` para `'home' | 'notepad' | 'calc' | 'plaque'`. Atualizar `net.onPlaque` e `net.onWelcome` para também `setPlaquesText`.

- [ ] **Step 3: Confirmar a luz por clique**

Em `engine.ts` (Task 5), o `mousedown` já chama `toggleTargetRoom()` quando `this.target` existe, e `toggleTargetRoom` chama `onToggleLight`. Confirmar que `page.tsx` define `engine.current.onToggleLight = (roomId, on) => net.current?.light(roomId, on)` (feito em Task 5, Step 4) e que `net.onLight` chama `engine.current?.applyLight`. Nada novo a codar — apenas verificar no código.

- [ ] **Step 4: Escrever/ajustar teste de browser**

Em `verify-browser.mjs`, adicionar passos que: com o jogo ativo, chamam via `page.evaluate`:
```js
await page.evaluate(() => {
  const g = document.querySelector('.scene').__game;
  g.applyPlaque('W1', 'TESTE');
  return g.env.plaques.find((p) => p.roomId === 'W1').text ?? '';
});
```
E verificar que a luz alterna localmente:
```js
const on = await page.evaluate(() => {
  const g = document.querySelector('.scene').__game;
  g.applyLight('W1', true);
  return g.env.rooms.find((r) => r.roomId === 'W1').on;
});
```
(`plaques[].setText` já armazena `text` no objeto retornado — definido em Task 6, Step 4.)

Run: `node verify-browser.mjs`
Expected: PASS.

- [ ] **Step 5: Rodar tudo**

Run: `npm run server:test`, `npm test`, `npm run build`, `npm run lint`
Expected: tudo PASS / sem erros.

- [ ] **Step 6: Commit**

```bash
git add app server verify-browser.mjs
git commit -m "feat: app da placa no notebook e luz por clique replicada"
```

---

## Self-Review

**Cobertura da spec:**
- identity → Tasks 1, 2, 4. ✔
- presence (sala única, spawn salvo, lista, FPS) → Tasks 3, 5. ✔
- world (sala de spawn + porta, placa LED) → Task 6. ✔
- computer (6 PCs, notepad/calculadora por máquina) → Task 7. ✔
- room-state (placa via notebook replicada) → Tasks 3, 6, 8. ✔
- interact (luz por clique, E mantido) → Tasks 5, 8. ✔
- Sucesso 1..8 mapeados nas tasks acima. ✔

**Desvios conscientes (ponytail):**
- Token único de 7d em vez de access+refresh (`server/auth/tokens.ts`). Adicionar refresh só se expiração incomodar.
- Validação de movimento server-side é limites + anti-teleporte, não colisão fina (evita duplicar o mapa). Colisão fina permanece no cliente.
- Avatares remotos são caixas simples + etiqueta de nome (personagens completos foram removidos do jogo).
