import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createEnvironment } from './environment';
import { createWeapon } from './weapon';
import { createEnemy } from './enemy';
import { getGraphicsProfile, type GraphicsPreset } from './graphics';

export type Snapshot = {
  mode: 'menu' | 'playing' | 'paused' | 'dead' | 'complete';
  health: number;
  ammo: number;
  reserve: number;
  kills: number;
  total: number;
  time: number;
  heading: number;
  hit: number;
  damage: number;
  reloading: boolean;
  objective: string;
  fps: number;
  enemies: { x: number; z: number }[];
  player: { x: number; z: number };
  aiming: boolean;
  extraction: number;
  notice: string;
};
type Actor = {
  model: ReturnType<typeof createEnemy>;
  health: number;
  cooldown: number;
  dead: number;
  index: number;
  visible: boolean;
  think: number;
  canSee: boolean;
  phase: number;
  path: THREE.Vector3[];
  navClock: number;
};
type Particle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  max: number;
  gravity: number;
  spin: number;
};

class Soundscape {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  rain: AudioBufferSourceNode | null = null;
  muted = false;
  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const C = window.AudioContext;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.42;
    this.master.connect(this.ctx.destination);
    const b = this.ctx.createBuffer(
      1,
      this.ctx.sampleRate * 3,
      this.ctx.sampleRate,
    );
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.rain = this.ctx.createBufferSource();
    this.rain.buffer = b;
    this.rain.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.value = 0.12;
    this.rain.connect(filter).connect(g).connect(this.master);
    this.rain.start();
  }
  setMute(v: boolean) {
    this.muted = v;
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(
        v ? 0 : 0.42,
        this.ctx.currentTime,
        0.07,
      );
  }
  noise(duration: number, volume: number, frequency: number) {
    if (!this.ctx || !this.master) return;
    const c = this.ctx,
      b = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate),
      d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random() * 2 - 1) * Math.exp((-i / d.length) * 7);
    const s = c.createBufferSource();
    s.buffer = b;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = frequency;
    const g = c.createGain();
    g.gain.value = volume;
    s.connect(f).connect(g).connect(this.master);
    s.start();
    s.onended = () => {
      s.disconnect();
      f.disconnect();
      g.disconnect();
    };
  }
  tone(f: number, duration: number, volume: number, to = 0) {
    if (!this.ctx || !this.master) return;
    const c = this.ctx,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, c.currentTime);
    if (to)
      o.frequency.exponentialRampToValueAtTime(to, c.currentTime + duration);
    g.gain.setValueAtTime(volume, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(c.currentTime + duration);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  shot(enemy = false) {
    this.noise(0.23, enemy ? 0.3 : 0.85, enemy ? 1300 : 4800);
    this.tone(enemy ? 90 : 140, 0.17, enemy ? 0.08 : 0.3, 35);
  }
  hit() {
    this.tone(1400, 0.045, 0.06, 900);
  }
  step() {
    this.noise(0.12, 0.13, 700);
  }
  reload() {
    this.noise(0.17, 0.18, 3900);
    this.tone(270, 0.08, 0.025, 110);
  }
  dispose() {
    this.rain?.stop();
    void this.ctx?.close();
  }
}

export class Game {
  host: HTMLDivElement;
  onState: (s: Snapshot) => void;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(68, 1, 0.045, 220);
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  env: ReturnType<typeof createEnvironment>;
  weapon: ReturnType<typeof createWeapon>;
  sound = new Soundscape();
  actors: Actor[] = [];
  particles: Particle[] = [];
  particlePool: THREE.Mesh[] = [];
  particleGeometry = new THREE.BoxGeometry(0.015, 0.015, 0.015);
  world: THREE.Object3D[] = [];
  keys = new Set<string>();
  ray = new THREE.Raycaster();
  clock = new THREE.Clock();
  frame = 0;
  elapsed = 0;
  hudClock = 0;
  shotClock = 0;
  reloadClock = 0;
  stepClock = 0;
  lastDamage = -100;
  noticeClock = 0;
  recoil = 0;
  yaw = 0;
  pitch = 0;
  velocity = new THREE.Vector3();
  vertical = 0;
  feetY = 0;
  firing = false;
  aiming = false;
  sprinting = false;
  disposed = false;
  cinematic = true;
  sensitivity = 1;
  started = false;
  pointerFallback = false;
  lastMouse = { x: 0, y: 0 };
  extractionMesh: THREE.Group;
  liveTime = 0;
  state: Snapshot = {
    mode: 'menu',
    health: 100,
    ammo: 30,
    reserve: 180,
    kills: 0,
    total: 9,
    time: 0,
    heading: 0,
    hit: 0,
    damage: 0,
    reloading: false,
    objective: 'Clear the freight terminal',
    fps: 60,
    enemies: [],
    player: { x: 0, z: 13 },
    aiming: false,
    extraction: 0,
    notice: '',
  };
  cleanup: (() => void)[] = [];
  constructor(host: HTMLDivElement, onState: (s: Snapshot) => void) {
    this.host = host;
    this.onState = onState;
    this.ray.camera = this.camera;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 1.7, 13);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.env = createEnvironment(THREE, this.scene);
    this.weapon = createWeapon(THREE, this.camera);
    this.world = this.scene.children.filter(
      (o) =>
        o instanceof THREE.Mesh &&
        o.material instanceof THREE.MeshStandardMaterial,
    );
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.24, 0.5, 1.08);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.extractionMesh = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.025, 8, 64),
      new THREE.MeshBasicMaterial({
        color: 0xe2ca80,
        transparent: true,
        opacity: 0.8,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03;
    this.extractionMesh.add(ring);
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8),
      new THREE.MeshStandardMaterial({
        color: 0xb29757,
        emissive: 0xe4b64d,
        emissiveIntensity: 3,
      }),
    );
    post.position.y = 0.35;
    this.extractionMesh.add(post);
    const light = new THREE.PointLight(0xffc167, 8, 7);
    light.position.y = 1;
    this.extractionMesh.add(light);
    this.extractionMesh.position.set(0, 0, -39);
    this.extractionMesh.visible = false;
    this.scene.add(this.extractionMesh);
    const supply = new THREE.Group();
    const supplyMat = new THREE.MeshStandardMaterial({
      color: 0x39433a,
      roughness: 0.6,
      metalness: 0.25,
    });
    const supplyBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.66, 0.75),
      supplyMat,
    );
    supplyBody.position.y = 0.4;
    supplyBody.castShadow = true;
    supply.add(supplyBody);
    const supplyLid = new THREE.Mesh(
      new THREE.BoxGeometry(1.34, 0.08, 0.8),
      new THREE.MeshStandardMaterial({
        color: 0x788267,
        roughness: 0.45,
        metalness: 0.3,
      }),
    );
    supplyLid.position.y = 0.77;
    supplyLid.castShadow = true;
    supply.add(supplyLid);
    for (const x of [-0.4, 0.4]) {
      const strap = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.7, 0.77),
        new THREE.MeshStandardMaterial({
          color: 0x171f1c,
          metalness: 0.4,
          roughness: 0.4,
        }),
      );
      strap.position.set(x, 0.42, 0);
      supply.add(strap);
    }
    const sc = document.createElement('canvas');
    sc.width = 256;
    sc.height = 96;
    const sx = sc.getContext('2d')!;
    sx.fillStyle = '#c9dc9c';
    sx.fillRect(0, 0, 256, 96);
    sx.fillStyle = '#18251e';
    sx.font = 'bold 28px monospace';
    sx.textAlign = 'center';
    sx.fillText('AMMUNITION', 128, 39);
    sx.font = '20px monospace';
    sx.fillText('[ E ] RESUPPLY', 128, 72);
    const supplySign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.36),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc) }),
    );
    supplySign.position.set(0, 0.42, 0.383);
    supply.add(supplySign);
    supply.position.set(-3, 0, 10);
    this.scene.add(supply);
    this.env.colliders.push({
      minX: -3.65,
      maxX: -2.35,
      minZ: 9.625,
      maxZ: 10.375,
      maxY: 0.81,
    });
    supply.traverse((o) => {
      if (
        o instanceof THREE.Mesh &&
        o.material instanceof THREE.MeshStandardMaterial
      )
        this.world.push(o);
    });
    const supplyLight = new THREE.PointLight(0xd7e6a2, 3, 4);
    supplyLight.position.set(-3, 1.5, 10);
    this.scene.add(supplyLight);
    this.bind();
    this.resize();
    this.addActors();
    this.animate();
  }
  configure(o: {
    graphics: GraphicsPreset;
    muted: boolean;
    sensitivity: number;
    cinematic: boolean;
  }) {
    const profile = getGraphicsProfile(o.graphics);
    this.sound.setMute(o.muted);
    this.sensitivity = o.sensitivity;
    this.cinematic = o.cinematic;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, profile.pixelRatio));
    this.renderer.shadowMap.enabled = profile.shadows;
    this.env.setShadowMapSize(profile.shadowMapSize);
    this.bloom.enabled = o.cinematic && profile.bloomStrength > 0;
    this.bloom.strength = o.cinematic ? profile.bloomStrength : 0;
    this.env.setRainCount(profile.rainCount);
    this.resize();
  }
  listen<K extends keyof WindowEventMap>(
    type: K,
    fn: (e: WindowEventMap[K]) => void,
  ) {
    window.addEventListener(type, fn);
    this.cleanup.push(() => window.removeEventListener(type, fn));
  }
  bind() {
    this.listen('resize', () => this.resize());
    this.listen('keydown', (e) => {
      if (
        ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
          e.code,
        ) &&
        this.state.mode === 'playing'
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.reload();
      if (
        e.code === 'KeyE' &&
        this.state.mode === 'playing' &&
        Math.hypot(this.camera.position.x + 3, this.camera.position.z - 10) < 3
      ) {
        this.state.reserve = 180;
        this.state.ammo = 30;
        this.reloadClock = 0;
        this.state.reloading = false;
        this.state.notice = 'AMMUNITION REPLENISHED';
        this.noticeClock = 2;
        this.sound.reload();
      }
      if (e.code === 'KeyQ' && !e.repeat && this.state.mode === 'playing')
        this.aiming = !this.aiming;
      if (e.code === 'Escape') this.pause();
      if (
        e.code === 'Space' &&
        this.state.mode === 'playing' &&
        this.vertical === 0
      ) {
        this.vertical = 6.25;
        this.sound.step();
      }
    });
    this.listen('keyup', (e) => this.keys.delete(e.code));
    this.listen('mousedown', (e) => {
      if (this.state.mode !== 'playing') return;
      if (e.button === 0) {
        this.firing = true;
        this.shoot();
      }
      if (e.button === 2) this.aiming = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });
    this.listen('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.aiming = false;
    });
    this.listen('mousemove', (e) => {
      if (this.state.mode !== 'playing') return;
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && !this.pointerFallback) return;
      if (!locked && !Number.isFinite(this.lastMouse.x)) {
        this.lastMouse = { x: e.clientX, y: e.clientY };
        return;
      }
      const dx = locked ? e.movementX : e.clientX - this.lastMouse.x,
        dy = locked ? e.movementY : e.clientY - this.lastMouse.y;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.yaw -= dx * 0.00165 * this.sensitivity * (this.aiming ? 0.6 : 1);
      this.pitch -= dy * 0.00165 * this.sensitivity * (this.aiming ? 0.6 : 1);
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.35, 1.35);
    });
    this.listen('contextmenu', (e) => {
      if (this.state.mode === 'playing') e.preventDefault();
    });
    this.listen('blur', () => this.pause());
    const lock = () => {
      if (
        document.pointerLockElement !== this.renderer.domElement &&
        this.state.mode === 'playing' &&
        !this.pointerFallback
      )
        this.pause();
    };
    document.addEventListener('pointerlockchange', lock);
    this.cleanup.push(() =>
      document.removeEventListener('pointerlockchange', lock),
    );
    const visibility = () => {
      if (document.hidden) this.pause();
    };
    document.addEventListener('visibilitychange', visibility);
    this.cleanup.push(() =>
      document.removeEventListener('visibilitychange', visibility),
    );
  }
  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  }
  start() {
    if (this.state.mode === 'dead' || this.state.mode === 'complete')
      this.reset();
    this.sound.init();
    this.started = true;
    this.state.mode = 'playing';
    this.firing = false;
    this.aiming = false;
    this.pointerFallback = false;
    this.lastMouse = { x: NaN, y: NaN };
    this.renderer.domElement.focus();
    try {
      const promise = this.renderer.domElement.requestPointerLock();
      if (promise && typeof promise.catch === 'function')
        void promise.catch(() => {
          this.pointerFallback = true;
          this.state.notice = 'FREE CURSOR LOOK · Q TO AIM';
          this.noticeClock = 5;
        });
    } catch {
      this.pointerFallback = true;
    }
    this.emit();
  }
  pause() {
    if (this.state.mode !== 'playing') return;
    this.state.mode = 'paused';
    this.keys.clear();
    this.firing = false;
    this.aiming = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.emit();
  }
  restart() {
    this.reset();
    this.start();
  }
  reset() {
    this.state = {
      ...this.state,
      mode: 'menu',
      health: 100,
      ammo: 30,
      reserve: 180,
      kills: 0,
      time: 0,
      hit: 0,
      damage: 0,
      extraction: 0,
      notice: '',
      objective: 'Clear the freight terminal',
      reloading: false,
    };
    this.reloadClock = 0;
    this.liveTime = 0;
    this.feetY = 0;
    this.vertical = 0;
    this.lastDamage = -100;
    this.camera.position.set(0, 1.7, 13);
    this.yaw = 0;
    this.pitch = 0;
    this.velocity.set(0, 0, 0);
    this.keys.clear();
    for (const a of this.actors) this.scene.remove(a.model.group);
    this.actors = [];
    this.addActors();
    this.extractionMesh.visible = false;
    this.emit();
  }
  addActors() {
    const positions = [
      [-3, -13],
      [3, -22],
      [9, -16],
      [-8, -24],
      [7, -30],
      [-6, -32],
      [0, -37],
      [-19, -27],
      [18, -32],
    ];
    positions.forEach(([x, z], i) => {
      if (this.blocked(x, z, 0.4)) {
        const safe = this.env.spawnPoints[i % this.env.spawnPoints.length];
        x = safe.x;
        z = safe.z;
      }
      const model = createEnemy(THREE, this.scene, x, z, i);
      this.actors.push({
        model,
        health: 100,
        cooldown: 1.4 + i * 0.35,
        dead: 0,
        index: i,
        visible: true,
        think: 0,
        canSee: false,
        phase: i * 2.39,
        path: [],
        navClock: 0,
      });
    });
  }
  blocked(x: number, z: number, r = 0.32, feet = 0) {
    return (
      x < -23.7 ||
      x > 23.7 ||
      z < -41.7 ||
      z > 18.5 ||
      this.env.colliders.some(
        (c) =>
          feet < (c.maxY ?? 2.66) - 0.025 &&
          x + r > c.minX &&
          x - r < c.maxX &&
          z + r > c.minZ &&
          z - r < c.maxZ,
      )
    );
  }
  move(pos: THREE.Vector3, dx: number, dz: number, r = 0.32, feet = 0) {
    const length = Math.hypot(dx, dz),
      steps = Math.max(1, Math.ceil(length / 0.15));
    for (let i = 0; i < steps; i++) {
      if (!this.blocked(pos.x + dx / steps, pos.z, r, feet))
        pos.x += dx / steps;
      if (!this.blocked(pos.x, pos.z + dz / steps, r, feet))
        pos.z += dz / steps;
    }
  }
  findRoute(from: THREE.Vector3, to: THREE.Vector3) {
    const key = (x: number, z: number) => `${x},${z}`;
    let tx = Math.round(to.x),
      tz = Math.round(to.z);
    if (this.blocked(tx, tz, 0.43)) {
      let found = false;
      for (let r = 1; r <= 3 && !found; r++)
        for (let dx = -r; dx <= r && !found; dx++)
          for (let dz = -r; dz <= r; dz++) {
            if (!this.blocked(tx + dx, tz + dz, 0.43)) {
              tx += dx;
              tz += dz;
              found = true;
              break;
            }
          }
    }
    const start = [Math.round(from.x), Math.round(from.z)];
    const target = key(tx, tz),
      initial = key(start[0], start[1]);
    const queue = [start],
      parents = new Map<string, string>();
    parents.set(initial, '');
    let i = 0;
    while (i < queue.length && i < 3500) {
      const [x, z] = queue[i++],
        k = key(x, z);
      if (k === target) break;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          nz = z + dz,
          nk = key(nx, nz);
        if (!parents.has(nk) && !this.blocked(nx, nz, 0.43)) {
          parents.set(nk, k);
          queue.push([nx, nz]);
        }
      }
    }
    if (!parents.has(target)) return [];
    const path: THREE.Vector3[] = [];
    let cursor = target;
    while (cursor !== initial && cursor) {
      const [x, z] = cursor.split(',').map(Number);
      path.push(new THREE.Vector3(x, 0, z));
      cursor = parents.get(cursor)!;
    }
    return path.reverse();
  }
  reload() {
    if (
      this.state.mode !== 'playing' ||
      this.reloadClock > 0 ||
      this.state.ammo === 30 ||
      this.state.reserve === 0
    )
      return;
    this.reloadClock = 2.05;
    this.state.reloading = true;
    this.sound.reload();
    this.aiming = false;
  }
  lineClear(from: THREE.Vector3, to: THREE.Vector3) {
    const d = to.clone().sub(from),
      len = d.length();
    this.ray.set(from, d.normalize());
    this.ray.far = len - 0.25;
    const hit = this.ray.intersectObjects(this.world, true)[0];
    return !hit;
  }
  spawnParticle(
    position: THREE.Vector3,
    color: number,
    velocity: THREE.Vector3,
    life: number,
    _size: number,
    gravity = 9,
  ) {
    let mesh = this.particlePool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(
        this.particleGeometry,
        new THREE.MeshBasicMaterial({ transparent: true }),
      );
    }
    (mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    (mesh.material as THREE.MeshBasicMaterial).opacity = 1;
    mesh.position.copy(position);
    mesh.visible = true;
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      velocity,
      life,
      max: life,
      gravity,
      spin: Math.random() * 14,
    });
  }
  tracer(a: THREE.Vector3, b: THREE.Vector3, color = 0xffd29b) {
    const d = b.clone().sub(a);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.009, d.length(), 4),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65 }),
    );
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      d.normalize(),
    );
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      velocity: new THREE.Vector3(),
      life: 0.055,
      max: 0.055,
      gravity: 0,
      spin: 0,
    });
  }
  shoot() {
    if (this.shotClock > 0 || this.reloadClock > 0 || this.sprinting) return;
    if (this.state.ammo <= 0) {
      this.reload();
      return;
    }
    this.shotClock = 0.105;
    this.state.ammo--;
    this.weapon.flash();
    this.sound.shot();
    this.recoil = 1;
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.camera.updateMatrixWorld();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const spread = this.aiming ? 0.0018 : 0.006;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.normalize();
    this.ray.set(this.camera.position, dir);
    this.pitch += 0.006 + (this.aiming ? 0.001 : 0.002);
    this.yaw += (Math.random() - 0.5) * 0.003;
    this.ray.far = 120;
    const targets = this.actors
      .filter((a) => a.health > 0)
      .flatMap((a) => a.model.hitMeshes);
    const hits = this.ray.intersectObjects(targets, false);
    const cover = this.ray.intersectObjects(this.world, true)[0];
    let impact = this.camera.position.clone().addScaledVector(dir, 80);
    let got = false;
    if (hits.length && (!cover || hits[0].distance < cover.distance)) {
      const h = hits[0];
      impact = h.point;
      const actor = this.actors.find((a) =>
        a.model.hitMeshes.includes(h.object as THREE.Mesh),
      )!;
      const head = h.object.userData.head;
      actor.health -= head ? 105 : 39;
      this.state.hit = 0.16;
      this.sound.hit();
      got = true;
      for (let i = 0; i < 7; i++)
        this.spawnParticle(
          impact,
          0xc6b292,
          new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            Math.random() * 2,
            (Math.random() - 0.5) * 3,
          ),
          0.25,
          0.018,
        );
      if (actor.health <= 0) {
        actor.dead = 0.01;
        this.state.kills++;
        this.state.notice = head
          ? 'HEADSHOT  +150'
          : 'HOSTILE NEUTRALIZED  +100';
        this.noticeClock = 1.6;
        if (this.state.kills === this.state.total) {
          this.state.objective = 'Reach the extraction point';
          this.extractionMesh.visible = true;
          this.state.notice = 'PERIMETER CLEAR — EXTRACT';
          this.noticeClock = 4;
          this.sound.tone(590, 0.5, 0.1, 890);
        }
      }
    } else if (cover) {
      impact = cover.point;
      for (let i = 0; i < 6; i++)
        this.spawnParticle(
          impact,
          0xffca7a,
          new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            Math.random() * 3,
            (Math.random() - 0.5) * 4,
          ),
          0.2 + Math.random() * 0.18,
          0.013,
        );
    }
    const muzzle = new THREE.Vector3();
    this.weapon.muzzle.getWorldPosition(muzzle);
    if (Math.random() < 0.42 || got) this.tracer(muzzle, impact);
    const shell = this.camera.position
      .clone()
      .add(
        new THREE.Vector3(0.26, -0.16, -0.32).applyQuaternion(
          this.camera.quaternion,
        ),
      );
    this.spawnParticle(
      shell,
      0xac945d,
      new THREE.Vector3(1.4, 1.3, 0.1).applyQuaternion(this.camera.quaternion),
      1.2,
      0.018,
    );
    if (this.state.ammo === 0) this.reload();
  }
  damage(value: number) {
    this.state.health = Math.max(0, this.state.health - value);
    this.state.damage = 1;
    this.lastDamage = this.liveTime;
    this.sound.noise(0.15, 0.2, 450);
    if (this.state.health <= 0) {
      this.state.mode = 'dead';
      this.keys.clear();
      this.firing = false;
      this.aiming = false;
      if (document.pointerLockElement) document.exitPointerLock();
      this.emit();
    }
  }
  updateActors(dt: number) {
    for (const a of this.actors) {
      if (a.health <= 0) {
        a.dead = Math.min(1, a.dead + dt * 1.5);
        a.model.update(this.elapsed, false, a.dead);
        a.model.flash.visible = false;
        continue;
      }
      const pos = a.model.group.position;
      const to = this.camera.position.clone().sub(pos);
      const dist = Math.hypot(to.x, to.z);
      a.think -= dt;
      a.navClock -= dt;
      if (a.think <= 0) {
        a.think = 0.4 + Math.random() * 0.2;
        a.canSee =
          dist < 39 &&
          this.lineClear(
            pos.clone().add(new THREE.Vector3(0, 1.48, 0)),
            this.camera.position,
          );
      }
      a.model.group.rotation.y = Math.atan2(to.x, to.z);
      let moving = false;
      if ((dist > 6 || !a.canSee) && dist < 43) {
        let dx = to.x / dist,
          dz = to.z / dist;
        const side = Math.sin(this.liveTime * 0.65 + a.phase) * 0.5;
        let speed = dist > 16 ? 1.25 : 0.6;
        if (!a.canSee) {
          speed = 1.45;
          dx += Math.cos(a.phase + this.liveTime * 0.3) * 0.55;
          dz += Math.sin(a.phase + this.liveTime * 0.3) * 0.55;
          if (a.navClock <= 0) {
            a.path = this.findRoute(pos, this.camera.position);
            a.navClock = 2.5 + a.index * 0.05;
          }
          while (
            a.path.length &&
            Math.hypot(a.path[0].x - pos.x, a.path[0].z - pos.z) < 0.4
          )
            a.path.shift();
          if (a.path.length) {
            const target = a.path[0].clone().sub(pos);
            target.y = 0;
            target.normalize();
            dx = target.x;
            dz = target.z;
          }
        } else {
          dx = dx * 0.3 - dz * side;
          dz = dz * 0.3 + (to.x / dist) * side;
        }
        const old = pos.clone();
        this.move(pos, dx * dt * speed, dz * dt * speed, 0.42);
        if (old.distanceTo(pos) < 0.001 && !a.canSee)
          this.move(pos, dz * dt * speed, -dx * dt * speed, 0.42);
        moving = old.distanceTo(pos) > 0.001;
      }
      a.cooldown -= dt;
      a.model.flash.visible = a.cooldown > 0.93 && a.cooldown < 1.04;
      if (
        a.canSee &&
        a.cooldown <= 0 &&
        this.state.mode === 'playing' &&
        this.lineClear(
          pos.clone().add(new THREE.Vector3(0, 1.35, 0)),
          this.camera.position,
        )
      ) {
        a.cooldown = 0.9 + Math.random() * 0.9;
        a.model.flash.visible = true;
        this.sound.shot(true);
        const origin = pos.clone().add(new THREE.Vector3(0, 1.35, 0));
        const aim = this.camera.position
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 1.8,
              (Math.random() - 0.5) * 0.65,
              (Math.random() - 0.5) * 1.8,
            ),
          );
        this.tracer(origin, aim, 0xffb473);
        if (
          Math.random() < (this.sprinting ? 0.18 : 0.34) &&
          this.liveTime > 3.5
        )
          this.damage(6 + Math.random() * 5);
      }
      a.model.update(this.elapsed, moving, 0);
    }
  }
  updatePlayer(dt: number) {
    const f =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const r =
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    this.sprinting =
      this.keys.has('ShiftLeft') &&
      f > 0 &&
      !this.aiming &&
      this.reloadClock <= 0;
    const speed = this.sprinting ? 6.1 : this.aiming ? 2 : 3.8;
    const v = new THREE.Vector3(r, 0, -f);
    if (v.length() > 0) v.normalize();
    v.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).multiplyScalar(
      speed,
    );
    this.velocity.lerp(v, 1 - Math.exp(-dt * 13));
    this.move(
      this.camera.position,
      this.velocity.x * dt,
      this.velocity.z * dt,
      0.32,
      this.feetY,
    );
    let support = 0;
    for (const c of this.env.colliders) {
      const top = c.maxY ?? 2.66;
      if (
        this.camera.position.x + 0.25 > c.minX &&
        this.camera.position.x - 0.25 < c.maxX &&
        this.camera.position.z + 0.25 > c.minZ &&
        this.camera.position.z - 0.25 < c.maxZ &&
        this.feetY >= top - 0.04
      )
        support = Math.max(support, top);
    }
    this.vertical -= 16 * dt;
    this.feetY = Math.max(support, this.feetY + this.vertical * dt);
    if (this.feetY === support) this.vertical = 0;
    const moving = Math.min(1, this.velocity.length() / 3.8);
    this.camera.position.y =
      1.7 +
      this.feetY +
      Math.sin(this.elapsed * (this.sprinting ? 13 : 9)) * 0.018 * moving;
    this.camera.rotation.set(
      this.pitch,
      this.yaw,
      Math.sin(this.elapsed * 4.5) * moving * 0.0015,
    );
    this.camera.fov = THREE.MathUtils.lerp(
      this.camera.fov,
      this.aiming ? 46 : this.sprinting ? 75 : 68,
      1 - Math.exp(-dt * 12),
    );
    this.camera.updateProjectionMatrix();
    this.stepClock -= dt;
    if (moving > 0.3 && this.feetY === 0 && this.stepClock <= 0) {
      this.sound.step();
      this.stepClock = this.sprinting ? 0.3 : 0.43;
    }
    if (this.firing) this.shoot();
    if (this.state.health < 100 && this.liveTime - this.lastDamage > 5.5)
      this.state.health = Math.min(100, this.state.health + dt * 10);
    if (this.state.kills === this.state.total) {
      const dist = Math.hypot(
        this.camera.position.x,
        this.camera.position.z + 39,
      );
      this.state.extraction =
        dist < 2.6 ? Math.min(1, this.state.extraction + dt / 2.2) : 0;
      if (this.state.extraction >= 1) {
        this.state.mode = 'complete';
        this.firing = false;
        this.keys.clear();
        if (document.pointerLockElement) document.exitPointerLock();
        this.sound.tone(480, 0.8, 0.12, 960);
      }
    }
    return moving;
  }
  emit() {
    this.host.dataset.fps = String(this.state.fps);
    this.host.dataset.position = `${this.camera.position.x.toFixed(2)},${this.camera.position.z.toFixed(2)}`;
    this.host.dataset.mode = this.state.mode;
    this.onState({
      ...this.state,
      enemies: this.actors
        .filter((a) => a.health > 0)
        .map((a) => ({
          x: a.model.group.position.x,
          z: a.model.group.position.z,
        })),
      player: { x: this.camera.position.x, z: this.camera.position.z },
      heading: ((THREE.MathUtils.radToDeg(-this.yaw) % 360) + 360) % 360,
      aiming: this.aiming,
    });
  }
  animate = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    this.env.update(dt, this.elapsed);
    this.shotClock = Math.max(0, this.shotClock - dt);
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.state.hit = Math.max(0, this.state.hit - dt);
    this.state.damage = Math.max(0, this.state.damage - dt * 1.8);
    let moving = 0;
    if (this.state.mode === 'playing') {
      this.liveTime += dt;
      this.state.time = this.liveTime;
      moving = this.updatePlayer(dt);
      this.updateActors(dt);
      this.noticeClock -= dt;
      if (this.noticeClock <= 0)
        this.state.notice =
          Math.hypot(this.camera.position.x + 3, this.camera.position.z - 10) <
          3
            ? 'E  RESUPPLY AMMUNITION'
            : this.state.ammo === 0 && this.state.reserve === 0
              ? 'RETURN TO THE SUPPLY CRATE AT INSERTION'
              : '';
      if (this.reloadClock > 0) {
        const previous = this.reloadClock;
        this.reloadClock = Math.max(0, this.reloadClock - dt);
        if (previous > 1 && this.reloadClock <= 1) this.sound.reload();
        if (this.reloadClock === 0) {
          const n = Math.min(30 - this.state.ammo, this.state.reserve);
          this.state.ammo += n;
          this.state.reserve -= n;
          this.state.reloading = false;
          this.sound.reload();
        }
      }
    } else if (!this.started) {
      this.camera.position.set(
        0.7 + Math.sin(this.elapsed * 0.08) * 0.16,
        1.78,
        12.8,
      );
      this.camera.rotation.set(
        -0.015,
        -0.15 + Math.sin(this.elapsed * 0.05) * 0.014,
        0,
      );
      for (const a of this.actors) a.model.update(this.elapsed, false, 0);
    }
    this.weapon.update(dt, {
      time: this.elapsed,
      moving,
      sprinting: this.sprinting && this.state.mode === 'playing',
      aiming: this.aiming && this.state.mode === 'playing',
      reloading: this.reloadClock > 0 ? 1 - this.reloadClock / 2.05 : 0,
      recoil: this.recoil,
    });
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.velocity.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.z += p.spin * 0.6 * dt;
      if (p.mesh.position.y < 0.03) {
        p.mesh.position.y = 0.03;
        p.velocity.y = Math.abs(p.velocity.y) * 0.28;
        p.velocity.x *= 0.75;
        p.velocity.z *= 0.75;
      }
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(
        1,
        (p.life / p.max) * 3,
      );
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.visible = false;
        this.particlePool.push(p.mesh);
        this.particles.splice(i, 1);
      }
    }
    this.hudClock += dt;
    if (this.hudClock > 0.1) {
      this.hudClock = 0;
      this.state.fps = Math.round(1 / Math.max(dt, 0.001));
      this.emit();
    }
    this.composer.render();
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.cleanup.forEach((f) => f());
    this.sound.dispose();
    if (document.pointerLockElement === this.renderer.domElement)
      document.exitPointerLock();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          Object.values(m).forEach((v) => {
            if (v instanceof THREE.Texture) v.dispose();
          });
          m.dispose();
        });
      }
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
