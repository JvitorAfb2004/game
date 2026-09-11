import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createEnvironment } from './app/game/environment.ts';

const scene = new THREE.Scene();
const env = createEnvironment(THREE, scene);

assert.equal(env.spawnPoints.length, 6, 'six rooms');
assert.equal(env.doors.length, 6, 'six hinged doors');
assert.equal(env.rooms.length, 6, 'six switchable rooms');
for (const r of env.rooms)
  assert(r.switch && r.light && r.led, 'room has light and switch');
assert(env.colliders.length > 0, 'office has walls');

const blocked = (x, z, r = 0.32) =>
  env.colliders.some(
    (c) => x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ,
  );

for (let z = 12; z > -22; z -= 0.5)
  assert(!blocked(0, z), `corridor clear at z=${z}`);

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
for (const p of env.spawnPoints)
  assert(blocked(p.x, p.z), `desk blocks room center ${p.x},${p.z}`);
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
