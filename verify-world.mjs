import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createEnvironment } from './app/game/environment.ts';

const scene = new THREE.Scene();
const env = createEnvironment(THREE, scene);

assert.equal(env.spawnPoints.length, 6, 'six desk points');
assert.equal(env.doors.length, 10, 'six room doors + spawn south + spawn east + reception + copa');
assert.equal(env.rooms.length, 6, 'six switchable rooms');
assert.equal(env.plaques.length, 9, 'six room plaques + COPA + COPAVIA + COPALEST');
assert.deepEqual(
  env.rooms.map((r) => r.roomId),
  ['W1', 'W2', 'W3', 'E1', 'E2', 'E3'],
  'stable room ids',
);
for (const r of env.rooms)
  assert(r.switch && r.light && r.led && r.roomId, 'room has light, switch and id');
assert.equal(env.spawn.x, 0, 'spawn x');
env.plaques[0].setText('SALA TESTE');
assert.equal(env.plaques[0].text, 'SALA TESTE', 'plaque stores text');
assert(env.colliders.length > 0, 'office has walls');

const blocked = (x, z, r = 0.32) =>
  env.colliders.some(
    (c) => x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ,
  );

for (let z = 12; z > -22; z -= 0.5)
  assert(!blocked(0, z), `corridor clear at z=${z}`);

// spawn room: clear center, closed sides and back (sala larga: paredes em ±4)
assert(!blocked(0, 16.5), 'spawn room center clear');
assert(!blocked(2, 16.5), 'spawn room wide interior clear');
assert(blocked(4, 16.5), 'spawn room east wall');
assert(blocked(-4, 16.5), 'spawn room west wall');
assert(blocked(0, 18.4), 'spawn room north wall');

// copa: fechada, porta oeste passável, mesa sólida, 24 cadeiras
assert(!blocked(5.5, 15.5), 'copa door passable');
assert(blocked(6, 14), 'copa west wall');
assert(blocked(16, 16), 'copa east wall');
assert(blocked(11, 18.4), 'copa north wall');
assert(blocked(8.5, 15), 'copa table solid');
assert(!blocked(11, 16), 'copa center clear');
assert.equal(env.copaChairs.length, 24, 'twenty-four chairs');

for (const p of env.spawnPoints) {
  const side = Math.sign(p.x);
  assert(!blocked(side * 1.6, p.z), `door opening passable at ${p.x},${p.z}`);
  assert(blocked(side * 1.5, p.z + 2), `glass blocks beside the door at ${p.x},${p.z}`);
}

env.update(0.016, 1);
const instanced = scene.children.filter((o) => o.isInstancedMesh);
assert(instanced.length >= 4, 'static geometry is batched into instanced meshes');
assert.equal(env.notebooks.length, 9, 'nine notebooks (6 rooms + 3 reception)');
for (const n of env.notebooks)
  assert(n.y > 0.8 && n.y < 1.35, 'notebook screen at desk/counter height');
for (const p of env.spawnPoints) {
  const side = Math.sign(p.x);
  assert(blocked(side * 5.0, p.z), `desk sits near the back wall ${p.x},${p.z}`);
  assert(!blocked(side * 4.1, p.z), `room center is clear ${p.x},${p.z}`);
}
console.log(
  JSON.stringify(
    {
      checks: 'office corridor, six rooms, open entrances, instanced walls',
      colliders: env.colliders.length,
      notebooks: env.notebooks.length,
      instancedMeshes: instanced.length,
    },
    null,
    2,
  ),
);
