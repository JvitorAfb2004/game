import fs from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import assert from 'node:assert/strict';

const source = await fs.readFile('./app/game/engine.ts', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});
await fs.writeFile(
  './.verify-engine.mjs',
  outputText
    .replaceAll("'./environment'", "'./app/game/environment.ts'")
    .replaceAll("'./character'", "'./app/game/character.ts'")
    .replaceAll("'./graphics'", "'./app/game/graphics.ts'"),
);
const { Game } = await import('./.verify-engine.mjs');
globalThis.document = { pointerLockElement: null };

function fixture() {
  const g = Object.create(Game.prototype);
  Object.assign(g, {
    camera: new THREE.PerspectiveCamera(68, 1, 0.05, 200),
    scene: new THREE.Scene(),
    env: { colliders: [{ minX: -1, maxX: 1, minZ: -3, maxZ: -2, maxY: 1.07 }] },
    state: { mode: 'playing' },
    keys: new Set(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    elapsed: 0,
    feetY: 0,
    vertical: 0,
    sprinting: false,
    stepClock: 1,
    sound: new Proxy({}, { get: () => () => {} }),
  });
  g.camera.position.set(0, 1.7, 0);
  g.camera.rotation.order = 'YXZ';
  return g;
}

const g = fixture();
assert(g.blocked(0, -2.5, 0.32, 0), 'wall blocks movement');
assert(!g.blocked(0, -2.5, 0.32, 1.1), 'walking over low cover is allowed');
g.camera.position.set(0, 1.7, 0);
g.move(g.camera.position, 0, -10);
assert(g.camera.position.z > -1.7, 'long movement does not tunnel through a wall');
g.camera.position.set(0, 2.8, -2.5);
g.feetY = 1.1;
g.vertical = -1;
g.updatePlayer(0.05);
assert.equal(g.feetY, 1.07, 'land on low cover');
assert.equal(g.vertical, 0);
g.env = { colliders: [], doors: [{ group: new THREE.Object3D(), x: 0, z: 0, side: 1 }] };
g.camera.position.set(0, 1.7, 0);
g.updateDoors(0.05);
assert(g.env.doors[0].group.rotation.y > 0, 'door opens when the player is near');
g.camera.position.set(0, 1.7, 10);
g.updateDoors(0.5);
assert(g.env.doors[0].group.rotation.y < 0.05, 'door closes when the player is away');
await fs.unlink('./.verify-engine.mjs');
console.log('PASS: collision, swept movement, low-cover landing, door proximity.');
