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
  using = new Map<string, string>();

  addPlayer(p: NetPlayer, conn: Conn) {
    this.players.set(p.id, { y: 0, using: null, ...p, conn });
    this.sockets.set(conn, p.id);
  }
  move(id: string, x: number, z: number, yaw: number, y = 0) {
    const p = this.players.get(id);
    if (!p) return;
    const c = clampMove(p, x, z);
    p.x = c.x;
    p.z = c.z;
    p.yaw = yaw;
    p.y = y;
  }
  setUsing(id: string, roomId: string | null): boolean {
    const p = this.players.get(id);
    if (!p) return false;
    if (roomId === null) {
      for (const [r, u] of this.using) if (u === id) this.using.delete(r);
      p.using = null;
      return true;
    }
    const owner = this.using.get(roomId);
    if (owner && owner !== id) return false;
    for (const [r, u] of this.using) if (u === id) this.using.delete(r);
    this.using.set(roomId, id);
    p.using = roomId;
    return true;
  }
  usingRoom(id: string): string | null {
    return this.players.get(id)?.using ?? null;
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
    for (const [r, u] of this.using) if (u === id) this.using.delete(r);
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
    try {
      const rows = await db.select().from(roomState);
      for (const r of rows) this.plaques.set(r.roomId, r.plaqueText);
    } catch (e) {
      console.error('[room] falha ao carregar placas (banco fora?):', e);
    }
  }
  async loadSpawn(userId: string): Promise<{ x: number; z: number; yaw: number }> {
    const [pos] = await db
      .select()
      .from(playerPositions)
      .where(eq(playerPositions.userId, userId));
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
