import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createEnvironment } from './environment';
import { createCharacter } from './character';
import { getGraphicsProfile, type GraphicsPreset } from './graphics';

export type Snapshot = {
  mode: 'menu' | 'playing' | 'paused';
  fps: number;
  player: { x: number; z: number };
};

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
  bloom: UnrealBloomPass;
  env: ReturnType<typeof createEnvironment>;
  characters: ReturnType<typeof createCharacter>[] = [];
  sound = new Soundscape();
  keys = new Set<string>();
  clock = new THREE.Clock();
  frame = 0;
  elapsed = 0;
  hudClock = 0;
  stepClock = 0;
  yaw = 0;
  pitch = 0;
  velocity = new THREE.Vector3();
  vertical = 0;
  feetY = 0;
  sprinting = false;
  disposed = false;
  cinematic = true;
  sensitivity = 1;
  started = false;
  pointerFallback = false;
  lastMouse = { x: 0, y: 0 };
  liveTime = 0;
  state: Snapshot = {
    mode: 'menu',
    fps: 60,
    player: { x: 0, z: 13 },
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
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 1.7, 13);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.env = createEnvironment(THREE, this.scene);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(
      new RoomEnvironment(),
      0.04,
    ).texture;
    pmrem.dispose();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.24, 0.5, 1.08);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.bind();
    this.resize();
    this.addCharacters();
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
    this.state = { mode: 'menu', fps: this.state.fps, player: { x: 0, z: 13 } };
    this.emit();
  }
  addCharacters() {
    this.characters = this.env.spawnPoints.map((p, i) =>
      createCharacter(THREE, this.scene, p.x, p.z, i * 1.713),
    );
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
  emit() {
    this.host.dataset.fps = String(this.state.fps);
    this.host.dataset.position = `${this.camera.position.x.toFixed(2)},${this.camera.position.z.toFixed(2)}`;
    this.host.dataset.mode = this.state.mode;
    this.onState({
      mode: this.state.mode,
      fps: this.state.fps,
      player: { x: this.camera.position.x, z: this.camera.position.z },
    });
  }
  animate = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    this.env.update(dt, this.elapsed);
    this.updateDoors(dt);
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
    for (const c of this.characters) c.update(this.elapsed);
    void moving;
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
