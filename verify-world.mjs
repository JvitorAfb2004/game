import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createEnvironment } from './app/game/environment.ts';
import { createCharacter } from './app/game/character.ts';

globalThis.document = {
  // oxlint-disable-next-line typescript/no-deprecated
  ['createElement']() {
    return {
      width: 0,
      height: 0,
      getContext() {
        return new Proxy(
          {},
          { get: (t, k) => (k in t ? t[k] : () => {}) },
        );
      },
    };
  },
};

const scene = new THREE.Scene();
const env = createEnvironment(THREE, scene);

assert.equal(env.spawnPoints.length, 12, 'twelve room characters');
assert.equal(env.doors.length, 12, 'twelve hinged doors');
assert.equal(env.rooms.length, 12, 'twelve switchable rooms');
for (const r of env.rooms)
  assert(r.switch && r.light && r.led, 'room has light and switch');
assert(env.colliders.length > 0, 'office has walls');

const blocked = (x, z, r = 0.32) =>
  env.colliders.some(
    (c) => x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ,
  );

for (let z = 13; z > -36; z -= 0.5)
  assert(!blocked(0, z), `corridor clear at z=${z}`);

for (const p of env.spawnPoints) {
  const side = Math.sign(p.x);
  assert(!blocked(side * 1.6, p.z), `door opening passable at ${p.x},${p.z}`);
  assert(blocked(side * 1.5, p.z + 2), `glass blocks beside the door at ${p.x},${p.z}`);
}

env.update(0.016, 1);
const instanced = scene.children.filter((o) => o.isInstancedMesh);
assert(instanced.length >= 4, 'static geometry is batched into instanced meshes');
const charScene = new THREE.Scene();
const char = createCharacter(THREE, charScene, 0, 0, 0);
let charMeshes = 0;
char.group.traverse((o) => {
  if (o.isMesh) charMeshes++;
});
assert(charMeshes <= 10, `character budget: ${charMeshes} meshes, want <= 10`);
console.log(
  JSON.stringify(
    {
      checks: 'office corridor, twelve rooms, open entrances, instanced walls',
      colliders: env.colliders.length,
      characters: env.spawnPoints.length,
      instancedMeshes: instanced.length,
    },
    null,
    2,
  ),
);
