import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampMove, DEFAULT_SPAWN } from './game/movement.ts';
import { GameRoom } from './game/room.ts';

void test('clampMove limita teleporte e bordas', () => {
  assert.deepEqual(clampMove({ x: 0, z: 0 }, 0.2, 0.2), { x: 0.2, z: 0.2 });
  const far = clampMove(DEFAULT_SPAWN, 500, 500);
  assert(
    Math.hypot(far.x - DEFAULT_SPAWN.x, far.z - DEFAULT_SPAWN.z) <= 1.5 + 1e-6,
    'passo limitado',
  );
  const oob = clampMove({ x: 23.6, z: 18.4 }, 999, 999);
  assert(oob.x <= 23.7 && oob.z <= 18.5, 'dentro dos limites');
});

void test('GameRoom adiciona, move e remove jogador', () => {
  const room = new GameRoom();
  room.addPlayer({ id: 'a', username: 'ana', x: 0, z: 0, yaw: 0 }, { send: () => {} });
  assert.equal(room.snapshotPlayers().length, 1);
  room.move('a', 0.5, 0.5, 0.5);
  assert.equal(room.snapshotPlayers()[0].x, 0.5);
  room.leave('a');
  assert.equal(room.snapshotPlayers().length, 0);
});

void test('reconnect do mesmo usuário não duplica', () => {
  const room = new GameRoom();
  const base = { id: 'u1', username: 'ana', yaw: 0 };
  room.addPlayer({ ...base, x: 0, z: 0 }, { send: () => {} });
  room.addPlayer({ ...base, x: 5, z: 5 }, { send: () => {} });
  assert.equal(room.snapshotPlayers().length, 1);
  assert.equal(room.snapshotPlayers()[0].x, 5);
  room.leave('u1');
  assert.equal(room.snapshotPlayers().length, 0);
});

void test('acesso exclusivo ao computador', () => {
  const room = new GameRoom();
  const conn = { send: () => {} };
  room.addPlayer({ id: 'a', username: 'ana', x: 0, z: 0, yaw: 0 }, conn);
  room.addPlayer({ id: 'b', username: 'bia', x: 0, z: 0, yaw: 0 }, conn);
  assert.equal(room.setUsing('a', 'W1'), true);
  assert.equal(room.setUsing('b', 'W1'), false);
  assert.equal(room.setUsing('b', 'W2'), true);
  assert.equal(room.snapshotPlayers().find((p) => p.id === 'b')?.using, 'W2');
  room.setUsing('a', null);
  assert.equal(room.setUsing('b', 'W1'), true);
  room.leave('b');
  assert.equal(room.using.size, 0);
});

void test('move guarda a altura do pulo', () => {
  const room = new GameRoom();
  room.addPlayer({ id: 'a', username: 'ana', x: 0, z: 0, yaw: 0 }, { send: () => {} });
  room.move('a', 0.5, 0.5, 0.2, 1.2);
  assert.equal(room.snapshotPlayers()[0].y, 1.2);
});
