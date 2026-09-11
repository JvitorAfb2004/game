import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createEnvironment } from './environment';
import { getGraphicsProfile, type GraphicsPreset } from './graphics';

export type Snapshot = {
  mode: 'menu' | 'playing' | 'paused' | 'desktop';
  fps: number;
  player: { x: number; z: number };
  prompt: string;
  desktop: boolean;
};

type Room = ReturnType<typeof createEnvironment>['rooms'][number];

class Soundscape {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
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
  step() {
    this.noise(0.12, 0.13, 700);
  }
  dispose() {
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
  env: ReturnType<typeof createEnvironment>;
  sound = new Soundscape();
  keys = new Set<string>();
  clock = new THREE.Clock();
  frame = 0;
  elapsed = 0;
  hudClock = 0;
  // ponytail: dev-only perf telemetry, throttled console logs, zero UI cost
  perfSec = 0;
  perfFrames = 0;
  cpuSec = 0;
  cpuN = 0;
  cpuLogic = 0;
  cpuMatrix = 0;
  cpuChars = 0;
  cpuRender = 0;
  hotspotCooldown = 0;
  auditTimer = 0;
  stepClock = 0;
  yaw = 0;
  pitch = 0;
  velocity = new THREE.Vector3();
  vertical = 0;
  feetY = 0;
  sprinting = false;
  disposed = false;
  sensitivity = 1;
  started = false;
  pointerFallback = false;
  lastMouse = { x: 0, y: 0 };
  liveTime = 0;
  target: Room | null = null;
  notebookTarget: { x: number; y: number; z: number; roomId: string } | null = null;
  remoteGroup = new THREE.Group();
  remotes = new Map<string, THREE.Group>();
  remoteTargets = new Map<string, { x: number; z: number; yaw: number }>();
  onLocalMove: ((x: number, z: number, yaw: number) => void) | null = null;
  onToggleLight: ((roomId: string, on: boolean) => void) | null = null;
  netClock = 0;
  desktopRoomId: string | null = null;
  state: Snapshot = {
    mode: 'menu',
    fps: 60,
    player: { x: 0, z: 13 },
    prompt: '',
    desktop: false,
  };
  cleanup: (() => void)[] = [];
  constructor(host: HTMLDivElement, onState: (s: Snapshot) => void) {
    this.host = host;
    this.onState = onState;
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
    this.renderer.info.autoReset = false;
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 1.7, 13);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.env = createEnvironment(THREE, this.scene);
    this.scene.add(this.remoteGroup);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new OutputPass());
    this.bind();
    this.resize();
    (this.host as unknown as { __game?: Game }).__game = this;
    this.auditTimer = window.setTimeout(() => {
      if (!this.disposed) this.auditAssets();
    }, 3000);
    this.animate();
  }
  configure(o: {
    graphics: GraphicsPreset;
    muted: boolean;
    sensitivity: number;
  }) {
    const profile = getGraphicsProfile(o.graphics);
    this.sound.setMute(o.muted);
    this.sensitivity = o.sensitivity;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, profile.pixelRatio));
    this.renderer.shadowMap.enabled = profile.shadows;
    this.env.setShadowMapSize(profile.shadowMapSize);
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
      if (e.code === 'Escape' && this.state.mode === 'desktop') {
        this.exitDesktop();
        return;
      }
      if (e.code === 'KeyE' && this.state.mode === 'playing') {
        if (this.notebookTarget) {
          this.enterDesktop();
        } else {
          this.toggleTargetRoom();
        }
      }
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
      this.lastMouse = { x: e.clientX, y: e.clientY };
      if (e.button !== 0 || this.state.mode !== 'playing') return;
      if (this.notebookTarget) this.enterDesktop();
      else if (this.target) this.toggleTargetRoom();
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
      this.yaw -= dx * 0.00165 * this.sensitivity;
      this.pitch -= dy * 0.00165 * this.sensitivity;
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
    this.sound.init();
    this.started = true;
    this.state.mode = 'playing';
    this.pointerFallback = false;
    this.lastMouse = { x: NaN, y: NaN };
    this.renderer.domElement.focus();
    try {
      const promise = this.renderer.domElement.requestPointerLock();
      if (promise && typeof promise.catch === 'function')
        void promise.catch(() => {
          this.pointerFallback = true;
        });
    } catch {
      this.pointerFallback = true;
    }
    this.state.desktop = false;
    this.emit();
  }
  pause() {
    if (this.state.mode !== 'playing') return;
    this.state.mode = 'paused';
    this.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    this.emit();
  }
  restart() {
    this.reset();
    this.start();
  }
  reset() {
    this.camera.position.set(0, 1.7, 13);
    this.yaw = 0;
    this.pitch = 0;
    this.velocity.set(0, 0, 0);
    this.feetY = 0;
    this.vertical = 0;
    this.liveTime = 0;
    this.keys.clear();
    this.state = {
      mode: 'menu',
      fps: this.state.fps,
      player: { x: 0, z: 13 },
      prompt: '',
      desktop: false,
    };
    this.emit();
  }
  blocked(x: number, z: number, r = 0.32, feet = 0) {
    return (
      x < -23.7 ||
      x > 23.7 ||
      z < -41.7 ||
      z > 18.5 ||
      this.doorBlocked(x, z, r, feet) ||
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
  doorBlocked(x: number, z: number, r: number, feet: number) {
    if (feet > 0.5) return false;
    for (const d of this.env.doors) {
      if (Math.abs(d.group.rotation.y) > 0.4) continue;
      if (Math.abs(x - d.x) < r + 0.08 && Math.abs(z - d.z) < d.half + r)
        return true;
    }
    return false;
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
  updatePlayer(dt: number) {
    const f =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const r =
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    this.sprinting = this.keys.has('ShiftLeft') && f > 0;
    const speed = this.sprinting ? 6.1 : 3.8;
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
      this.sprinting ? 75 : 68,
      1 - Math.exp(-dt * 12),
    );
    this.camera.updateProjectionMatrix();
    this.stepClock -= dt;
    if (moving > 0.3 && this.feetY === 0 && this.stepClock <= 0) {
      this.sound.step();
      this.stepClock = this.sprinting ? 0.3 : 0.43;
    }
    return moving;
  }
  updateDoors(dt: number) {
    for (const d of this.env.doors) {
      const dist = Math.hypot(
        this.camera.position.x - d.x,
        this.camera.position.z - d.z,
      );
      const target = dist < 1 ? d.side * 1.55 : 0;
      d.group.rotation.y +=
        (target - d.group.rotation.y) * (1 - Math.exp(-dt * 9));
    }
  }
  updateRooms() {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    this.target = null;
    let prompt = '';
    for (const r of this.env.rooms) {
      const dist = Math.hypot(
        this.camera.position.x - r.x,
        this.camera.position.z - r.z,
      );
      r.light.visible = r.on && dist < 6;
      const toSwitch = new THREE.Vector3(
        r.switch.x - this.camera.position.x,
        r.switch.y - this.camera.position.y,
        r.switch.z - this.camera.position.z,
      );
      const d = toSwitch.length();
      if (d < 3 && toSwitch.normalize().dot(forward) > 0.97) {
        this.target = r;
        prompt = `PRESSIONE E PARA ${r.on ? 'DESLIGAR' : 'LIGAR'} A LUZ`;
      }
    }
    for (const c of this.env.corridorLights)
      c.light.visible = Math.abs(this.camera.position.z - c.z) < 10;
    this.notebookTarget = null;
    for (const n of this.env.notebooks) {
      const toNb = new THREE.Vector3(
        n.x - this.camera.position.x,
        n.y - this.camera.position.y,
        n.z - this.camera.position.z,
      );
      const d = toNb.length();
      if (d < 3.5 && toNb.normalize().dot(forward) > 0.85) {
        this.notebookTarget = n;
        prompt = 'PRESSIONE E OU CLIQUE PARA ACESSAR O NOTEBOOK';
      }
    }
    this.state.prompt = prompt;
  }
  toggleTargetRoom() {
    const r = this.target;
    if (!r) return;
    if (this.onToggleLight) this.onToggleLight(r.roomId, !r.on);
    else this.applyLight(r.roomId, !r.on);
    this.sound.noise(0.05, 0.1, 900);
  }
  makeRemote(username: string) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.1, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x35506b, roughness: 0.7 }),
    );
    body.position.y = 0.9;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xd9b48c, roughness: 0.6 }),
    );
    head.position.y = 1.62;
    g.add(body, head);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0b0f12';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#7fd6c2';
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(username.slice(0, 12), 128, 42);
    const tex = new THREE.CanvasTexture(canvas);
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.28),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    tag.position.y = 2.05;
    g.add(tag);
    g.userData.tag = tag;
    return g;
  }
  setRemotePlayers(
    players: { id: string; username: string; x: number; z: number; yaw: number }[],
  ) {
    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.id);
      this.remoteTargets.set(p.id, { x: p.x, z: p.z, yaw: p.yaw });
      if (!this.remotes.has(p.id)) {
        const g = this.makeRemote(p.username);
        this.remotes.set(p.id, g);
        this.remoteGroup.add(g);
        g.position.set(p.x, 0, p.z);
      }
    }
    for (const [id, g] of this.remotes)
      if (!seen.has(id)) {
        this.remoteGroup.remove(g);
        this.remotes.delete(id);
        this.remoteTargets.delete(id);
      }
  }
  updateRemotes(dt: number) {
    const k = 1 - Math.exp(-dt * 10);
    for (const [id, g] of this.remotes) {
      const t = this.remoteTargets.get(id);
      if (!t) continue;
      g.position.x += (t.x - g.position.x) * k;
      g.position.z += (t.z - g.position.z) * k;
      const tag = g.userData.tag as THREE.Mesh | undefined;
      if (tag) tag.quaternion.copy(this.camera.quaternion);
    }
  }
  spawnAt(x: number, z: number, yaw: number) {
    this.camera.position.set(x, 1.7, z);
    this.yaw = yaw;
    this.pitch = 0;
  }
  applyLight(roomId: string, on: boolean) {
    const r = this.env.rooms.find((room) => room.roomId === roomId);
    if (!r) return;
    r.on = on;
    r.light.visible = on;
    (r.led.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 1.6 : 0;
  }
  applyPlaque(roomId: string, text: string) {
    const plaques = (
      this.env as unknown as {
        plaques?: { roomId: string; setText(t: string): void }[];
      }
    ).plaques;
    plaques?.find((p) => p.roomId === roomId)?.setText(text);
  }
  enterDesktop() {
    this.state.mode = 'desktop';
    this.state.desktop = true;
    this.desktopRoomId = this.notebookTarget?.roomId ?? null;
    this.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    this.emit();
  }
  exitDesktop() {
    if (this.state.mode !== 'desktop') return;
    this.state.mode = 'playing';
    this.state.desktop = false;
    this.desktopRoomId = null;
    this.keys.clear();
    this.renderer.domElement.focus();
    try {
      const promise = this.renderer.domElement.requestPointerLock();
      if (promise && typeof promise.catch === 'function')
        void promise.catch(() => {
          this.pointerFallback = true;
        });
    } catch {
      this.pointerFallback = true;
    }
    this.emit();
  }
  emit() {
    this.host.dataset.fps = String(this.state.fps);
    this.host.dataset.position = `${this.camera.position.x.toFixed(2)},${this.camera.position.z.toFixed(2)}`;
    this.host.dataset.mode = this.state.mode;
    this.onState({
      mode: this.state.mode,
      fps: this.state.fps,
      player: { x: this.camera.position.x, z: this.camera.position.z },
      prompt: this.state.prompt,
      desktop: this.state.desktop,
    });
  }
  animate = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.renderer.info.reset();
    this.elapsed += dt;
    const frameMs = dt * 1000;
    const t0 = performance.now();
    this.env.update(dt, this.elapsed);
    this.updateDoors(dt);
    this.updateRooms();
    this.updateRemotes(dt);
    this.netClock -= dt;
    if (this.state.mode === 'playing' && this.netClock <= 0) {
      this.netClock = 1 / 15;
      this.onLocalMove?.(this.camera.position.x, this.camera.position.z, this.yaw);
    }
    let moving = 0;
    if (this.state.mode === 'playing') {
      this.liveTime += dt;
      moving = this.updatePlayer(dt);
    } else if (!this.started) {
      this.camera.position.set(
        0.5 + Math.sin(this.elapsed * 0.08) * 0.14,
        1.72,
        12.6,
      );
      this.camera.rotation.set(-0.01, -0.12 + Math.sin(this.elapsed * 0.05) * 0.012, 0);
    }
    const t1 = performance.now();
    const t2 = performance.now();
    this.scene.updateMatrixWorld();
    const t3 = performance.now();
    void moving;
    this.hudClock += dt;
    if (this.hudClock > 0.1) {
      this.hudClock = 0;
      this.state.fps = Math.round(1 / Math.max(dt, 0.001));
      this.emit();
    }
    this.composer.render();
    this.reportPerf(frameMs, t1 - t0, t3 - t2, t2 - t1, performance.now() - t3);
  };
  reportPerf(frameMs: number, logic: number, matrix: number, chars: number, render: number) {
    const sec = frameMs / 1000;
    this.perfSec += sec;
    this.perfFrames++;
    this.cpuSec += sec;
    this.cpuN++;
    this.cpuLogic += logic;
    this.cpuMatrix += matrix;
    this.cpuChars += chars;
    this.cpuRender += render;
    this.hotspotCooldown -= sec;
    if (frameMs > 25 && this.hotspotCooldown <= 0) {
      this.hotspotCooldown = 2;
      const p = this.camera.position;
      const info = this.renderer.info;
      console.warn(
        `[perf hotspot] ${frameMs.toFixed(1)}ms @ (${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) | calls ${info.render.calls} | visible ${this.countVisible()}`,
      );
    }
    if (this.perfSec >= 2 && this.perfFrames > 0) {
      const info = this.renderer.info;
      const fps = Math.round(this.perfFrames / this.perfSec);
      console.info(
        `[perf] fps ${fps} | frame ${(this.perfSec * 1000 / this.perfFrames).toFixed(1)}ms | calls ${info.render.calls} | tris ${info.render.triangles} | geo ${info.memory.geometries} | tex ${info.memory.textures}`,
      );
      this.host.dataset.perf = `${fps}|${info.render.calls}|${info.render.triangles}`;
      this.perfSec = 0;
      this.perfFrames = 0;
    }
    if (this.cpuSec >= 5 && this.cpuN > 0) {
      const avg = (v: number) => (v / this.cpuN).toFixed(2);
      const cpu = this.cpuLogic + this.cpuMatrix + this.cpuChars;
      console.info(
        `[perf cpu] logic ${avg(this.cpuLogic)}ms | matrix ${avg(this.cpuMatrix)}ms | chars ${avg(this.cpuChars)}ms | render-submit ${avg(this.cpuRender)}ms | ${this.cpuRender > cpu ? 'submit-bound' : 'cpu-bound'} (submit exclui GPU; fps baixo com submit baixo = GPU/fragment-bound)`,
      );
      this.cpuSec = 0;
      this.cpuN = 0;
      this.cpuLogic = this.cpuMatrix = this.cpuChars = this.cpuRender = 0;
    }
  }
  countVisible() {
    try {
      this.camera.updateMatrixWorld();
      const frustum = new THREE.Frustum();
      frustum.setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(
          this.camera.projectionMatrix,
          this.camera.matrixWorldInverse,
        ),
      );
      let n = 0;
      this.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && frustum.intersectsObject(o)) n++;
      });
      return n;
    } catch {
      return -1;
    }
  }
  auditAssets() {
    const tex = new Map<string, { w: number; h: number; n: number }>();
    const uniqMats = new Set<string>();
    const uniqTex = new Set<string>();
    let maxTex = 0;
    let materials = 0;
    let transparent = 0;
    let shadowCasters = 0;
    const geos = new Map<string, { n: number; tris: number; instanced: boolean }>();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.castShadow) shadowCasters++;
      const geo = mesh.geometry as THREE.BufferGeometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const tris = Math.round(
        (geo.index ? geo.index.count : geo.attributes.position.count) / 3,
      );
      const g = geos.get(geo.uuid) ?? { n: 0, tris, instanced: true };
      g.n++;
      if ((mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh !== true)
        g.instanced = false;
      geos.set(geo.uuid, g);
      const list = (
        Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      ) as THREE.Material[];
      for (const m of list) {
        materials++;
        uniqMats.add(m.uuid);
        if ((m as THREE.MeshStandardMaterial).transparent) transparent++;
        for (const v of Object.values(m)) {
          const t = v as THREE.Texture | null;
          if (t && (t as THREE.Texture).isTexture) {
            uniqTex.add((t as THREE.Texture).uuid);
            const img = (t as THREE.Texture).image as
              | { width?: number; height?: number }
              | undefined;
            maxTex = Math.max(maxTex, (img?.width ?? 0) * (img?.height ?? 0));
            const key = `${img?.width ?? 0}x${img?.height ?? 0}`;
            const e = tex.get(key) ?? { w: img?.width ?? 0, h: img?.height ?? 0, n: 0 };
            e.n++;
            tex.set(key, e);
          }
        }
      }
    });
    const repeats = [...geos.values()]
      .filter((g) => !g.instanced && g.n > 1)
      .sort((a, b) => b.n * b.tris - a.n * a.tris)
      .slice(0, 10)
      .map((g) => ({ meshes: g.n, trisPorMesh: g.tris, custo: g.n * g.tris }));
    console.info(
      `[perf assets] slots mesh-material ${materials} (=draw calls) | materiais únicos ${uniqMats.size} (transparentes ${transparent}) | shadowCasters ${shadowCasters} | texturas únicas ${uniqTex.size} (maior ${maxTex}px) | usos ${[...tex.entries()].map(([k, v]) => `${k}x${v.n}`).join(', ') || 'nenhuma'}`,
    );
    if (repeats.length) console.table(repeats);
    else console.info('[perf assets] sem repetição sem-instanciar no top: ok');
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.clearTimeout(this.auditTimer);
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
