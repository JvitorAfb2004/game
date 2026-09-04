import fs from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import assert from 'node:assert/strict';
const source=await fs.readFile('./app/game/engine.ts','utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
await fs.writeFile('./.verify-engine.mjs',outputText.replaceAll("'./environment'","'./app/game/environment.ts'").replaceAll("'./weapon'","'./app/game/weapon.ts'").replaceAll("'./enemy'","'./app/game/enemy.ts'"));
const {Game}=await import('./.verify-engine.mjs');
globalThis.document={pointerLockElement:null};
function fixture(){const g=Object.create(Game.prototype);Object.assign(g,{camera:new THREE.PerspectiveCamera(68,1,.05,200),ray:new THREE.Raycaster(),scene:new THREE.Scene(),actors:[],world:[],env:{colliders:[]},state:{mode:'playing',ammo:30,reserve:180,kills:0,total:9,health:100,extraction:0},keys:new Set(),velocity:new THREE.Vector3(),shotClock:0,reloadClock:0,recoil:0,yaw:0,pitch:0,elapsed:0,liveTime:10,lastDamage:0,feetY:0,vertical:0,stepClock:1,aiming:true,sprinting:false,firing:false,sound:new Proxy({},{get:()=>()=>{}}),weapon:{flash(){},muzzle:new THREE.Object3D()},extractionMesh:new THREE.Group(),spawnParticle(){},tracer(){},emit(){}});g.camera.position.set(0,1.7,0);g.camera.rotation.order='YXZ';g.ray.camera=g.camera;return g;}
function target(g,head=false){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.35),new THREE.MeshStandardMaterial());mesh.position.set(0,1.7,-8);mesh.userData.head=head;mesh.updateMatrixWorld(true);const actor={health:100,dead:0,model:{hitMeshes:[mesh],group:new THREE.Group()}};g.actors.push(actor);return actor;}
const rnd=Math.random;Math.random=()=>.5;
let g=fixture(),a=target(g);g.shoot();assert.equal(g.state.ammo,29);assert.equal(a.health,61);assert(g.pitch>0,'recoil applies after first accurate ray');g.shotClock=0;g.shoot();g.shotClock=0;g.shoot();assert.equal(g.state.kills,1,'three body shots neutralize');
g=fixture();a=target(g,true);g.shoot();assert.equal(g.state.kills,1,'headshot neutralizes');
g=fixture();a=target(g);const cover=new THREE.Mesh(new THREE.BoxGeometry(3,3,.5),new THREE.MeshStandardMaterial());cover.position.set(0,1.5,-4);cover.updateMatrixWorld(true);g.world=[cover];g.shoot();assert.equal(a.health,100,'cover blocks ray');assert.equal(g.state.ammo,29);
g=fixture();g.state.ammo=5;g.reload();assert.equal(g.reloadClock,2.05);assert(g.state.reloading);g=fixture();g.reload();assert.equal(g.reloadClock,0,'full magazine does not reload');
g=fixture();g.env.colliders=[{minX:-1,maxX:1,minZ:-3,maxZ:-2,maxY:1.07}];assert(g.blocked(0,-2.5,.32,0));assert(!g.blocked(0,-2.5,.32,1.1));g.camera.position.set(0,1.7,0);g.move(g.camera.position,0,-10);assert(g.camera.position.z>-1.7,'long movement does not tunnel through cover');g.camera.position.set(0,2.8,-2.5);g.feetY=1.1;g.vertical=-1;g.updatePlayer(.05);assert.equal(g.feetY,1.07,'land on low cover');assert.equal(g.vertical,0);
g=fixture();g.state.kills=9;g.camera.position.set(0,1.7,-39);g.state.extraction=.995;g.updatePlayer(.05);assert.equal(g.state.mode,'complete','extraction completes mission');
g=fixture();g.state.health=10;g.damage(20);assert.equal(g.state.mode,'dead');assert.equal(g.state.health,0);
Math.random=rnd;await fs.unlink('./.verify-engine.mjs');console.log('PASS: shot damage, headshots, cover, recoil ordering, ammunition, reload guards, collision sweep, low-cover landing, extraction, death.');
