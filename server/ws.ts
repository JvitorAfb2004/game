import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from './db/client.ts';
import { roomState, users } from './db/schema.ts';
import { verifyToken } from './auth/tokens.ts';
import { clientMsg } from './game/protocol.ts';
import { GameRoom } from './game/room.ts';
import { company } from './game/company.ts';

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
      room.addPlayer({ id: userId, username, character: user.character ?? 'azul', ...spawn }, conn);
      socket.send(
        JSON.stringify({
          type: 'welcome',
          id: userId,
          spawn,
          players: room.snapshotPlayers(),
          plaques: Object.fromEntries(room.plaques),
          lights: Object.fromEntries(room.lights),
          company: company.snapshot(),
        }),
      );
      room.broadcast({ type: 'players', players: room.snapshotPlayers() }, conn);

      const cerr = (error: string) => socket.send(JSON.stringify({ type: 'companyError', error }));
      const syncCompany = () => room.broadcast({ type: 'company', company: company.snapshot() });
      // fila/atendimento: PC da recepção (REC/REC2/REC3) OU corpo no balcão
      const atReception = () => {
        if (['REC', 'REC2', 'REC3'].includes(room.usingRoom(userId) ?? '')) return true;
        const p = room.players.get(userId);
        if (!p) return false;
        return Math.abs(p.x) < 3.2 && Math.abs(p.z - -27.7) < 3;
      };
      socket.on('message', async (raw: Buffer) => {
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
          room.move(userId, m.x, m.z, m.yaw, m.y ?? 0);
          room.broadcast({ type: 'players', players: room.snapshotPlayers() }, conn);
        } else if (m.type === 'using') {
          const ok = room.setUsing(userId, m.roomId);
          socket.send(JSON.stringify({ type: 'using', roomId: m.roomId, ok }));
          room.broadcast({ type: 'players', players: room.snapshotPlayers() });
        } else if (m.type === 'light') {
          room.setLight(m.roomId, m.on);
          room.broadcast({ type: 'light', roomId: m.roomId, on: m.on });
        } else if (m.type === 'plaque') {
          room.setPlaque(m.roomId, m.text);
          room.broadcast({ type: 'plaque', roomId: m.roomId, text: m.text });
          try {
            await db
              .insert(roomState)
              .values({ roomId: m.roomId, plaqueText: m.text })
              .onConflictDoUpdate({ target: roomState.roomId, set: { plaqueText: m.text } });
          } catch (e) {
            console.error('[plaque] falha ao salvar:', e);
            cerr('placa aplicada, mas falhou ao salvar no banco');
          }
        } else if (m.type === 'callNext') {
          if (!atReception()) {
            cerr('use o computador da recepção');
          } else if (!company.callNext()) {
            cerr('fila vazia');
          } else {
            syncCompany();
          }
        } else if (m.type === 'attend') {
          if (!atReception()) {
            cerr('use o computador da recepção');
          } else if (!company.attend(m.botId)) {
            cerr('cliente saiu da fila');
          } else {
            syncCompany();
          }
        } else if (m.type === 'answer') {
          if (!atReception()) {
            cerr('use o computador da recepção');
          } else {
            const res = company.answer(m.botId, m.accept);
            if (res !== 'ok') cerr(res);
            syncCompany();
          }
        } else if (m.type === 'hold') {
          if (!atReception()) {
            cerr('use o computador da recepção');
          } else {
            const res = company.hold(m.botId);
            if (res !== 'ok') cerr(res);
            syncCompany();
          }
        } else if (m.type === 'talk') {
          if (!atReception()) {
            cerr('use o computador da recepção');
          } else {
            const res = company.talk(m.botId, m.text);
            if (res !== 'ok') cerr(res);
            syncCompany();
          }
        } else if (m.type === 'payBill') {
          const res = company.payBill(m.billId);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'deliver') {
          const res = company.deliver(m.projectId);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'hire') {
          const res = company.hire(m.candidateId);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'assign') {
          const res = company.assign(m.freelancerId, m.projectId);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'paySalary') {
          const res = company.paySalary(m.freelancerId);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'payDebt') {
          const res = company.payDebt(m.debtId);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'work') {
          company.work(userId, m.projectId, m.user ?? username);
          syncCompany();
        } else if (m.type === 'raise') {
          const res = company.raise(m.requestId, m.accept);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'pause') {
          company.setPaused(m.paused);
          syncCompany();
        } else if (m.type === 'fire') {
          const res = company.fire(m.freelancerId);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'post') {
          const res = company.post(m.freelancerId, m.index);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'buyNotebook') {
          const res = company.buyNotebook(m.tier ?? 'basico');
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'buyDolly') {
          const res = company.buyDolly();
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'setRhRoom') {
          const res = company.setRhRoom(m.roomId);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'claimBox') {
          const res = company.claimBox(m.boxId, userId, username);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'dropBox') {
          const res = company.dropBox(m.boxId, m.x, m.z, userId);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'placeBox') {
          const res = company.placeBox(m.boxId, m.station, m.room, userId);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'uninstallMachine') {
          const res = company.uninstallMachine(m.machineId);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'repairMachine') {
          const res = company.repairMachine(m.machineId);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'callEmployee') {
          const res = company.callEmployee(m.freelancerId, userId);
          if (res !== 'ok') cerr(res);
          syncCompany();
        } else if (m.type === 'releaseEmployee') {
          const res = company.releaseEmployee(m.freelancerId, userId);
          if (res !== 'ok') cerr(res);
          syncCompany();
        }
      });

      socket.on('close', () => {
        void room.savePosition(userId);
        company.dropPlayer(userId);
        room.leave(userId);
        room.broadcast({ type: 'players', players: room.snapshotPlayers() });
      });
    })();
  });
}
