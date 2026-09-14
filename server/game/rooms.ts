// ponytail: salas privadas (lobbies) — 1 GameRoom + 1 CompanySim por código.
// Vazia há 5min: serializa no Postgres e descarrega da RAM (hiberna).
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { roomHistory, roomMembers, rooms } from '../db/schema.ts';
import { verifyToken } from '../auth/tokens.ts';
import { GameRoom } from './room.ts';
import { CompanySim } from './company.ts';

export type RoomCtx = {
  code: string;
  name: string;
  ownerId: string;
  room: GameRoom;
  company: CompanySim;
  tickV: number;
  emptyFor: number;
};

const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const HIBERNATE_AFTER_SEC = 300; // 5min vazia
let seedFileUsed = false;

function authUser(req: FastifyRequest, reply: FastifyReply): { sub: string; username: string } | null {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    return verifyToken(token);
  } catch {
    void reply.code(401).send({ error: 'não autenticado' });
    return null;
  }
}

function genCode(): string {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)];
  return c;
}

class RoomManager {
  ctxs = new Map<string, RoomCtx>();

  async ensureRoom(code: string, joinerId: string, name?: string): Promise<RoomCtx> {
    const hit = this.ctxs.get(code);
    if (hit) return hit;
    const [row] = await db.select().from(rooms).where(eq(rooms.code, code));
    const room = new GameRoom();
    await room.loadPlaques().catch(() => {});
    const company = new CompanySim();
    let tickV = 0;
    let ownerId = joinerId;
    let roomName = name ?? 'Sala';
    if (row) {
      ownerId = row.ownerId;
      roomName = row.name;
      tickV = row.tickV ?? 0;
      const snap = (row.snapshot ?? {}) as { company?: unknown; lights?: Record<string, boolean> };
      if (snap.company && typeof snap.company === 'object') company.restore(snap.company);
      else {
        company.genCandidates(3);
        company.machines.push({ id: `pc-seed-${Date.now().toString(36)}`, where: 'rm:W1', broken: false });
      }
      if (snap.lights) for (const [k, v] of Object.entries(snap.lights)) room.lights.set(k, v);
    } else {
      // primeira vez: migra o save legado uma única vez, depois mundo novo
      const legacy = join(process.cwd(), 'data', 'company.json');
      if (!seedFileUsed && existsSync(legacy)) {
        company.load();
        try {
          renameSync(legacy, `${legacy}.migrated`);
        } catch {
          /* segue com o estado em memória */
        }
      } else {
        company.genCandidates(3);
        company.machines.push({ id: `pc-seed-${Date.now().toString(36)}`, where: 'rm:W1', broken: false });
      }
      seedFileUsed = true;
      await db.insert(rooms).values({ code, name: roomName, ownerId }).onConflictDoNothing();
      await this.persist(code, { code, name: roomName, ownerId, room, company, tickV, emptyFor: 0 });
    }
    const ctx: RoomCtx = { code, name: roomName, ownerId, room, company, tickV, emptyFor: 0 };
    this.ctxs.set(code, ctx);
    return ctx;
  }

  async persist(code: string, ctx?: RoomCtx) {
    const c = ctx ?? this.ctxs.get(code);
    if (!c) return;
    try {
      await db
        .insert(rooms)
        .values({
          code,
          name: c.name,
          ownerId: c.ownerId,
          status: c.room.players.size ? 'active' : 'hibernating',
          snapshot: { company: c.company.serialize(), lights: Object.fromEntries(c.room.lights) },
          tickV: c.tickV,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: rooms.code,
          set: {
            status: c.room.players.size ? 'active' : 'hibernating',
            snapshot: { company: c.company.serialize(), lights: Object.fromEntries(c.room.lights) },
            tickV: c.tickV,
            updatedAt: new Date(),
          },
        });
    } catch (e) {
      console.error('[rooms] falha ao persistir', code, e);
    }
  }

  /** congela e descarrega (chamado quando vazia há 5min) */
  async hibernate(code: string) {
    const c = this.ctxs.get(code);
    if (!c || c.room.players.size) return;
    for (const p of c.room.snapshotPlayers()) c.company.dropPlayer(p.id);
    await this.persist(code, c);
    this.ctxs.delete(code);
    console.info(`[rooms] ${code} hibernada`);
  }

  tickAll(dtSec: number) {
    for (const [code, c] of this.ctxs) {
      const hasPlayers = c.room.players.size > 0;
      c.company.autoPause(dtSec, hasPlayers);
      c.company.tick(dtSec);
      c.tickV += 1;
      if (c.company.changed || c.tickV % 5 === 0) {
        c.company.changed = false;
        c.room.broadcast({ type: 'company', company: c.company.snapshot() });
      }
      if (!hasPlayers) {
        c.emptyFor += dtSec;
        if (c.emptyFor >= HIBERNATE_AFTER_SEC) void this.hibernate(code);
      } else {
        c.emptyFor = 0;
      }
    }
  }

  async saveAll() {
    for (const [code, c] of this.ctxs) {
      await c.room.saveAll().catch(() => {});
      if (c.tickV % 10 === 0) await this.persist(code, c);
    }
  }

  broadcastAll(data: unknown) {
    for (const [, c] of this.ctxs) c.room.broadcast(data);
  }

  async createRoom(ownerId: string, name: string): Promise<{ code: string; name: string }> {
    for (let i = 0; i < 8; i++) {
      const code = genCode();
      try {
        await db.insert(rooms).values({ code, name: name.slice(0, 24) || 'Sala', ownerId });
        await db.insert(roomMembers).values({ roomCode: code, userId: ownerId, role: 'owner' }).onConflictDoNothing();
        await db.insert(roomHistory).values({ roomCode: code, userId: ownerId });
        return { code, name: name.slice(0, 24) || 'Sala' };
      } catch {
        /* código colidiu: tenta outro */
      }
    }
    throw new Error('não consegui gerar código, tente de novo');
  }

  async listRooms(userId: string) {
    const owned = await db.select().from(rooms).where(eq(rooms.ownerId, userId));
    const recent = (await db
      .select({ code: roomHistory.roomCode, name: rooms.name, joinedAt: roomHistory.joinedAt })
      .from(roomHistory)
      .innerJoin(rooms, eq(rooms.code, roomHistory.roomCode))
      .where(eq(roomHistory.userId, userId))
      .orderBy(desc(roomHistory.joinedAt))
      .limit(10)) as { code: string; name: string; joinedAt: Date }[];
    const seen = new Set(owned.map((r) => r.code));
    return {
      owned: owned.map((r) => ({ code: r.code, name: r.name, live: this.ctxs.has(r.code) })),
      recent: recent.filter((r) => !seen.has(r.code)).map((r) => ({ code: r.code, name: r.name, live: this.ctxs.has(r.code) })),
    };
  }

  async joinRoom(code: string, userId: string) {
    const [row] = await db.select().from(rooms).where(eq(rooms.code, code));
    if (!row) return null;
    await db
      .insert(roomMembers)
      .values({ roomCode: code, userId, role: row.ownerId === userId ? 'owner' : 'member' })
      .onConflictDoUpdate({ target: [roomMembers.roomCode, roomMembers.userId], set: { lastSeen: new Date() } });
    await db.insert(roomHistory).values({ roomCode: code, userId });
    return { code: row.code, name: row.name };
  }

  async leaveRoom(code: string, userId: string) {
    try {
      await db
        .update(roomHistory)
        .set({ leftAt: new Date() })
        .where(and(eq(roomHistory.roomCode, code), eq(roomHistory.userId, userId), sql`${roomHistory.leftAt} IS NULL`));
    } catch {
      /* histórico é melhor-esforço */
    }
  }
}

export const manager = new RoomManager();

export async function registerRoomRoutes(app: FastifyInstance) {
  app.post('/rooms', { preHandler: async (req, reply) => { if (!authUser(req, reply)) return; } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = z.object({ name: z.string().trim().min(1).max(24).optional().default('Sala') }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'nome inválido' });
    try {
      return await manager.createRoom(user.sub, parsed.data.name);
    } catch (e) {
      return reply.code(500).send({ error: e instanceof Error ? e.message : 'erro' });
    }
  });
  app.get('/rooms', { preHandler: async (req, reply) => { if (!authUser(req, reply)) return; } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    try {
      return await manager.listRooms(user.sub);
    } catch {
      return reply.code(500).send({ error: 'erro ao listar' });
    }
  });
  app.post('/rooms/:code/join', { preHandler: async (req, reply) => { if (!authUser(req, reply)) return; } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const code = String((req.params as { code?: string }).code ?? '').toUpperCase().slice(0, 12);
    if (!code) return reply.code(400).send({ error: 'código inválido' });
    const found = await manager.joinRoom(code, user.sub);
    if (!found) return reply.code(404).send({ error: 'sala não encontrada' });
    return found;
  });
}
