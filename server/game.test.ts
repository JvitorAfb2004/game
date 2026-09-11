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
