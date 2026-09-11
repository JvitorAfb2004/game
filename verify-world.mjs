import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createEnvironment } from './app/game/environment.ts';

const scene = new THREE.Scene();
const env = createEnvironment(THREE, scene);

assert.equal(env.spawnPoints.length, 6, 'six desk points');
assert.equal(env.doors.length, 7, 'six room doors + spawn door');
assert.equal(env.rooms.length, 6, 'six switchable rooms');
assert.equal(env.plaques.length, 6, 'six led plaques');
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

// spawn room: clear center, closed sides and back
assert(!blocked(0, 16.5), 'spawn room center clear');
assert(blocked(2, 16.5), 'spawn room east wall');
assert(blocked(-2, 16.5), 'spawn room west wall');
assert(blocked(0, 18.4), 'spawn room north wall');

for (const p of env.spawnPoints) {
  const side = Math.sign(p.x);
  assert(!blocked(side * 1.6, p.z), `door opening passable at ${p.x},${p.z}`);
  assert(blocked(side * 1.5, p.z + 2), `glass blocks beside the door at ${p.x},${p.z}`);
}

env.update(0.016, 1);
const instanced = scene.children.filter((o) => o.isInstancedMesh);
assert(instanced.length >= 4, 'static geometry is batched into instanced meshes');
assert.equal(env.notebooks.length, 6, 'six notebooks');
for (const n of env.notebooks)
  assert(n.y > 0.8 && n.y < 1.2, 'notebook screen at desk height');
for (const p of env.spawnPoints) {
  const side = Math.sign(p.x);
  assert(blocked(side * 5.8, p.z), `desk sits near the back wall ${p.x},${p.z}`);
  assert(!blocked(side * 4.25, p.z), `room center is clear ${p.x},${p.z}`);
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
