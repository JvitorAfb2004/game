import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createEnvironment } from './app/game/environment.ts';
const gradient={addColorStop(){}};
const context=new Proxy({createLinearGradient(){return gradient},createRadialGradient(){return gradient}},{get(target,key){return key in target?target[key]:()=>{}}});
// oxlint-disable-next-line typescript/no-deprecated
globalThis.document={['createElement'](){return {width:0,height:0,getContext(){return context}}}};
const scene=new THREE.Scene();
const env=createEnvironment(THREE,scene);
const blocked=(x,z,r=.36)=>x< -23.7||x>23.7||z< -41.7||z>18.5||env.colliders.some(c=>x+r>c.minX&&x-r<c.maxX&&z+r>c.minZ&&z-r<c.maxZ);
assert(!blocked(0,13),'start must be clear');assert(!blocked(0,-39),'extraction must be clear');
const key=(x,z)=>`${x},${z}`;const queue=[[0,13]],seen=new Set([key(0,13)]);let qi=0;
while(qi<queue.length){const [x,z]=queue[qi++];for(const [dx,dz] of [[.5,0],[-.5,0],[0,.5],[0,-.5]]){const nx=x+dx,nz=z+dz,k=key(nx,nz);if(!blocked(nx,nz)&&!seen.has(k)){seen.add(k);queue.push([nx,nz])}}}
assert(seen.has(key(0,-39)),'extraction reachable on foot');
const positions=[[-3,-13],[3,-22],[9,-16],[-8,-24],[7,-30],[-6,-32],[0,-37],[-19,-27],[18,-32]];
positions.forEach(([x,z],i)=>{if(blocked(x,z,.4)){const p=env.spawnPoints[i%env.spawnPoints.length];x=p.x;z=p.z;}assert(!blocked(x,z,.4),`enemy ${i} clear spawn`);assert(seen.has(key(x,z)),`enemy ${i} reachable spawn`)});
const ray=new THREE.Raycaster();ray.set(new THREE.Vector3(0,1.7,13),new THREE.Vector3(0,0,-1));ray.far=120;scene.updateMatrixWorld(true);const physical=scene.children.filter(o=>o instanceof THREE.Mesh&&o.material instanceof THREE.MeshStandardMaterial);const hit=ray.intersectObjects(physical,true)[0];assert(hit&&Number.isFinite(hit.distance),'solid geometry raycast works without sprites');
env.update(.016,1);
console.log(JSON.stringify({checks:'start, extraction, all nine enemy spawns, reachable routes, solid raycast, rain update',reachableHalfMeterCells:seen.size,colliders:env.colliders.length,drawObjects:scene.children.length,firstHitDistance:hit.distance},null,2));
