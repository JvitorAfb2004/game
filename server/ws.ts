import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from './db/client.ts';
import { roomState, users } from './db/schema.ts';
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
