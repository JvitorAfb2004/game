import * as THREE from 'three';
import { createEnvironment } from './environment';
import { getGraphicsProfile, type GraphicsPreset } from './graphics';

export type Snapshot = {
  mode: 'menu' | 'playing' | 'paused' | 'desktop';
  fps: number;
  player: { x: number; z: number };
  prompt: string;
  desktop: boolean;
  desktopRoom: string | null;
  calledHired: { id: string; name: string } | null;
  requestTalk: { id: string; name: string; kind: 'raise' | 'resign' } | null;
};

type Room = ReturnType<typeof createEnvironment>['rooms'][number];

// ponytail: NPCs compartilham geometria/material (antes: cada spawn criava tudo novo e nunca liberava → geo 22→277)
const NPC_BODY_GEO = new THREE.BoxGeometry(0.5, 1.1, 0.3);
const NPC_FEET_GEO = new THREE.BoxGeometry(0.52, 0.12, 0.36);
const NPC_HEAD_GEO = new THREE.BoxGeometry(0.28, 0.28, 0.28);
const NPC_TAG_GEO = new THREE.PlaneGeometry(1.1, 0.28);
// ponytail: humanoide low-poly — membros compartilham 2 geometrias (braço/perna)
const FIG_TORSO_GEO = new THREE.BoxGeometry(0.46, 0.55, 0.28);
const FIG_HEAD_GEO = new THREE.BoxGeometry(0.26, 0.26, 0.26);
const FIG_LIMB_GEO = new THREE.BoxGeometry(0.13, 0.55, 0.15);
const FIG_LEG_GEO = new THREE.BoxGeometry(0.16, 0.5, 0.17);
import { FIGURE_VARIANTS, FBX_MAP, FBX_FACE_OFFSET, variantForId } from './figures';
import type { FigureVariantId } from './figures';

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
  crouching = false;
  crouchLerp = 0; // 0 em pé, 1 agachado (para câmera e hitbox)
  disposed = false;
  chatOpen = false; // ponytail: conversando trava WASD (A/D respondem o chat)
  sensitivity = 1;
  started = false;
  pointerFallback = false;
  lastMouse = { x: 0, y: 0 };
  liveTime = 0;
  target: Room | null = null;
  callTarget = false;
  hoverBotId: string | null = null;
  // ponytail: chamar funcionário (mira + E) — segue o jogador até liberar
  localId = '';
  hoverHiredId: string | null = null;
  calledHiredId: string | null = null;
  hiredCalled = new Map<string, string | null>();
  hiredNames = new Map<string, string>();
  followRing: THREE.Mesh | null = null;
  onCallEmployee: ((freelancerId: string) => void) | null = null;
  onReleaseEmployee: ((freelancerId: string) => void) | null = null;
  onFireEmployee: ((freelancerId: string) => void) | null = null;
  // ponytail: RH físico — pedido espera resposta na sala; anel vermelho; E conversa
  rhRoom: string | null = null;
  hiredWaiting = new Map<string, 'raise' | 'resign' | null>();
  reqRings = new Map<string, THREE.Mesh>();
  requestTalkId: string | null = null;
  // ponytail: TV da copa — HTML5 <video> + CanvasTexture; switch na parede; áudio 3D com falloff gradual
  tvVideo: HTMLVideoElement | null = null;
  tvVideoCanvas: HTMLCanvasElement | null = null;
  tvVideoCtx: CanvasRenderingContext2D | null = null;
  tvVideoTex: THREE.CanvasTexture | null = null;
  tvVideoScreen: THREE.Mesh | null = null;
  tvSwitchGroup: THREE.Group | null = null;
  tvPlaying = false;
  tvVolume = 0.5;
  tvAudioCtx: AudioContext | null = null;
  tvAudioGain: GainNode | null = null;
  tvAudioPanner: PannerNode | null = null;
  tvAudioSource: MediaElementAudioSourceNode | null = null;
  tvClock = 0;
  copaVapor: THREE.Group | null = null;
  // ponytail: carrinho/dolly — visual local, usa claim/drop/place existentes (sem protocolo novo)
  dolly: THREE.Group | null = null;
  dollyGrabbed = false;
  dollyTarget: 'grab' | null = null;
  dollySlots: THREE.Group[] = [];
  myBoxes: string[] = [];
  dollyLoad: string[] = []; // caixas em cima do carrinho (grudam nele)
  handBoxId: string | null = null; // caixa na mão (minhas menos as do carrinho)
  notebookTarget: { x: number; y: number; z: number; roomId: string } | null = null;
  remoteGroup = new THREE.Group();
  remotes = new Map<string, THREE.Group>();
  remoteNames = new Map<string, string>();
  remoteCarry = new Map<string, { remoteId: string; mesh: THREE.Group }>();
  botGroup = new THREE.Group();
  bots = new Map<string, THREE.Group>();
  botWalk = new Map<string, { wx: number[]; wz: number[]; tx: number; tz: number; ty: number; leaving: boolean }>();
  botStates = new Map<string, string>();
  botLabels = new Map<string, string>();
  devGroup = new THREE.Group();
  devs = new Map<string, THREE.Group>();
  devWalk = new Map<string, { wx: number[]; wz: number[]; tx: number; ry: number; leaving: boolean }>();
  recepGroup = new THREE.Group();
  receps = new Map<string, THREE.Group>();
  recepWalk = new Map<string, { wx: number[]; wz: number[]; tx: number; ry: number; leaving: boolean }>();
  hiredGroup = new THREE.Group();
  hiredWorkers = new Map<string, THREE.Group>();
  hiredWalk = new Map<string, { wx: number[]; wz: number[]; ry: number; leaving: boolean }>();
  pkgGroup = new THREE.Group();
  pkgs = new Map<string, THREE.Group>();
  devMonitors: THREE.Group[] = [];
  carryMesh: THREE.Group | null = null;
  carryBoxId: string | null = null;
  stockStations: ('ok' | 'broken' | 'empty')[] = [];
  boxTarget:
    | { kind: 'pickup'; id: string }
    | { kind: 'place'; idx: number }
    | { kind: 'placeroom'; roomId: string }
    | { kind: 'load' }
    | { kind: 'drop' }
    | null = null;
  pkgLabels = new Map<string, string>();
  techGroup = new THREE.Group();
  techs = new Map<string, THREE.Group>();
  techWalk = new Map<string, { wx: number[]; wz: number[]; ry: number; leaving: boolean }>();
  dropGhost: THREE.Mesh | null = null;
  dropOk = false;
  onNotice: ((msg: string) => void) | null = null;
  mgrSeat = new Map<string, { x: number; z: number; ry: number }>();
  mgrNext = new Map<string, number>();
  remoteTargets = new Map<
    string,
    { x: number; z: number; yaw: number; y: number; crouch: boolean; using: string | null }
  >();
  onLocalMove: ((x: number, z: number, yaw: number, y: number, crouch?: boolean) => void) | null =
    null;
  onToggleLight: ((roomId: string, on: boolean) => void) | null = null;
  onCallNext: (() => void) | null = null;
  onBotClick: ((botId: string) => void) | null = null;
  onPickupBox: ((boxId: string) => void) | null = null;
  onDropBox: ((boxId: string, x: number, z: number) => void) | null = null;
  onPlaceBox: ((boxId: string, station: number | null, room: string | null) => void) | null = null;
  roomsPC: Record<string, boolean> | null = null;
  onUse: ((roomId: string | null) => void) | null = null;
  netClock = 0;
  desktopRoomId: string | null = null;
  state: Snapshot = {
    mode: 'menu',
    fps: 60,
    player: { x: 0, z: 13 },
    prompt: '',
    desktop: false,
    desktopRoom: null,
    calledHired: null,
    requestTalk: null,
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
    // neblina casa com o fundo: esconde o corte da render distance
    this.scene.fog = new THREE.Fog(0x1b2126, 60, 220);
    this.scene.add(this.remoteGroup);
    this.scene.add(this.botGroup);
    this.scene.add(this.devGroup);
    this.scene.add(this.recepGroup);
    this.scene.add(this.hiredGroup);
    this.scene.add(this.techGroup);
    this.scene.add(this.pkgGroup);
    // laptops das 12 estações — base 0.5x0.04x0.35, keyboard, screen 0.48x0.3 code, hinge 70°, shadow (sai 2 retângulos)
    {
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e2328, roughness: 0.65 });
      const hingeMat = new THREE.MeshStandardMaterial({ color: 0x0f1214, roughness: 0.5 });
      const frameMat2 = new THREE.MeshStandardMaterial({ color: 0x0f141a, roughness: 0.55 });
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
      let kbTex2: THREE.Texture | null = null; let codeTex2: THREE.Texture | null = null;
      if (typeof document !== 'undefined') {
        const kc = document.createElement('canvas'); kc.width = 512; kc.height = 256;
        const kctx = kc.getContext('2d')!; kctx.fillStyle = '#1b1e22'; kctx.fillRect(0, 0, 512, 256);
        kctx.fillStyle = '#2a2e33'; for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 10; c2++) { kctx.fillRect(14 + c2 * 49, 14 + r * 42, 42, 32); kctx.fillStyle = '#3a4048'; kctx.fillRect(16 + c2 * 49, 16 + r * 42, 38, 6); kctx.fillStyle = '#2a2e33'; }
        kctx.fillStyle = '#2a2e33'; kctx.fillRect(22, 182, 468, 26);
        kbTex2 = new THREE.CanvasTexture(kc); kbTex2.colorSpace = THREE.SRGBColorSpace;
        const cc = document.createElement('canvas'); cc.width = 512; cc.height = 320;
        const cctx = cc.getContext('2d')!; cctx.fillStyle = '#0d1a2a'; cctx.fillRect(0, 0, 512, 320);
        cctx.font = '13px monospace'; cctx.fillStyle = '#5ee9b5';
        ;["const app=()=>{","  const d=await fetch('/api')","  return d.map(x=>x*2)","}","// build ok","// 35 tests","export default app"].forEach((l, i) => cctx.fillText(l, 14, 22 + i * 22));
        cctx.fillStyle = '#122a22'; cctx.fillRect(0, 280, 512, 40); cctx.fillStyle = '#7fd6c2'; cctx.font = 'bold 16px monospace'; cctx.fillText('● CODE • 60', 14, 305);
        codeTex2 = new THREE.CanvasTexture(cc); codeTex2.colorSpace = THREE.SRGBColorSpace;
      }
      const kbMat2 = new THREE.MeshStandardMaterial({ color: kbTex2 ? 0xffffff : 0x2a2e33, roughness: 0.75 });
      if (kbTex2) kbMat2.map = kbTex2;
      const codeBase = new THREE.MeshStandardMaterial({ color: codeTex2 ? 0xffffff : 0x0b1e2e, emissive: 0x0a2a3a, emissiveIntensity: codeTex2 ? 0.32 : 0, roughness: 0.45 });
      if (codeTex2) codeBase.map = codeTex2;
      for (const st of this.env.devStations ?? []) {
        const grp = new THREE.Group(); grp.position.set(st.mx, 0.78, st.z); grp.rotation.y = st.ry;
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), shadowMat);
        shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, 0.001, 0); grp.add(shadow);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.35), baseMat);
        base.position.set(0, 0.02, 0); base.castShadow = true; base.receiveShadow = true; grp.add(base);
        const kbPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.30), kbMat2);
        kbPlane.rotation.x = -Math.PI / 2; kbPlane.position.set(0, 0.041, 0.015); grp.add(kbPlane);
        const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.014, 0.014), hingeMat);
        hinge.position.set(0, 0.04, -0.175); grp.add(hinge);
        const pivot = new THREE.Group(); pivot.position.set(0, 0.04, -0.175); pivot.rotation.x = -70 * Math.PI / 180;
        const scrMat = codeBase.clone();
        const scrFrame = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.30, 0.012), frameMat2);
        scrFrame.position.set(0, 0.15, 0.006); scrFrame.castShadow = true; pivot.add(scrFrame);
        const scrPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.26), scrMat);
        scrPlane.position.set(0, 0.15, 0.013); pivot.add(scrPlane);
        grp.add(pivot);
        grp.visible = false; grp.userData.scrMat = scrMat; grp.userData.pivot = pivot;
        this.devMonitors.push(grp); this.scene.add(grp);
      }
      }
    // caixa segurada (filha da câmera)
    const carry = new THREE.Group();
    const cbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.28, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 }),
    );
    const tape = new THREE.Mesh(
      new THREE.BoxGeometry(0.37, 0.29, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.9 }),
    );
    carry.add(cbox, tape);
    carry.position.set(0.35, -0.3, -0.55);
    carry.visible = false;
    this.carryMesh = carry;
    this.camera.add(carry);
    // quadrado fantasma: onde a caixa vai cair (verde = pode, vermelho = bloqueado)
    const ghost = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.55),
      new THREE.MeshBasicMaterial({ color: 0x39d353, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    ghost.rotation.x = -Math.PI / 2;
    ghost.visible = false;
    this.dropGhost = ghost;
    this.scene.add(ghost);
    // ponytail: sem EffectComposer — só tinha RenderPass+OutputPass (overhead puro)
    // anel do chamado: verde = perto, vermelho = longe (mesmo código do dropGhost)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.62, 24),
      new THREE.MeshBasicMaterial({ color: 0x39d353, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    this.followRing = ring;
    this.scene.add(ring);
    // carrinho/dolly no spawn: plataforma + alça; leva 3 caixas, -40% vel, sem pulo
    const dolly = new THREE.Group();
    const plat = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.08, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xd08030, roughness: 0.6 }),
    );
    plat.position.y = 0.14;
    plat.castShadow = true;
    const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    bar1.position.set(-0.4, 0.6, -0.3);
    const bar2 = bar1.clone();
    bar2.position.set(0.4, 0.6, -0.3);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    grip.position.set(0, 1.05, -0.3);
    dolly.add(plat, bar1, bar2, grip);
    for (let i = 0; i < 3; i++) {
      const slot = this.makeCarryBox(0.3);
      slot.position.set(0, 0.18 + i * 0.26, 0.02);
      slot.visible = false;
      this.dollySlots.push(slot);
      dolly.add(slot);
    }
    dolly.position.set(3.0, 0, 15.6);
    dolly.visible = false; // só aparece depois de comprar na loja
    this.dolly = dolly;
    this.scene.add(dolly);
    // tela da TV da copa — HTML5 <video> + CanvasTexture + áudio 3D
    const tv = this.env.copaTV;
    if (tv && tv.videoScreen) {
      this.tvVideoScreen = tv.videoScreen;
      this.tvSwitchGroup = tv.switchGroup;
      const vd = this.tvVideoScreen.userData;
      this.tvVideo = vd.video;
      this.tvVideoCanvas = vd.videoCanvas;
      this.tvVideoCtx = vd.videoCtx;
      this.tvVideoTex = vd.videoTex;
      this.initTVAudio();
      if (this.tvVideo) this.tvVideo.play().catch(() => { /* autoplay bloqueado; play no 1º clique */ });
    }
    this.copaVapor = (this.env as unknown as { copaVapor?: THREE.Group }).copaVapor ?? null;
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
    renderDistance?: number;
  }) {
    const profile = getGraphicsProfile(o.graphics);
    this.sound.setMute(o.muted);
    this.sensitivity = o.sensitivity;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, profile.pixelRatio));
    this.renderer.shadowMap.enabled = profile.shadows;
    this.env.setShadowMapSize(profile.shadowMapSize);
    if (o.renderDistance !== undefined) this.setRenderDistance(o.renderDistance);
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
      if (e.code === 'KeyE' && this.state.mode === 'playing') this.pressE();
      // ponytail: P demite quem está chamado com você (sem painel)
      if (e.code === 'KeyP' && this.state.mode === 'playing' && this.calledHiredId)
        this.onFireEmployee?.(this.calledHiredId);
      if (e.code === 'Escape') this.pause();
      if (
        e.code === 'Space' &&
        this.state.mode === 'playing' &&
        this.vertical === 0 &&
        !this.dollyGrabbed // carrinho: sem pulo
      ) {
        this.vertical = 6.25;
        this.sound.step();
      }
    });
    this.listen('keyup', (e) => this.keys.delete(e.code));
    this.listen('mousedown', (e) => {
      this.lastMouse = { x: e.clientX, y: e.clientY };
      if (e.button !== 0 || this.state.mode !== 'playing') return;
      this.pressE();
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
  }
  start() {
    this.sound.init();
    // clique em Jogar = gesto: se a TV está ligada (estado persistido), libera o play
    if (this.tvPlaying) void this.tvVideo?.play().catch(() => {});
    this.ensureTV();
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
    this.onLocalMove?.(
      this.camera.position.x,
      this.camera.position.z,
      this.yaw,
      this.feetY,
      this.crouching,
    );
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
      desktopRoom: null,
      calledHired: null,
      requestTalk: null,
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
  // ponytail: salas trancadas (aluguel) — porta bloqueia sempre, nem pulando
  lockedRooms = new Set<string>();
  serverPlaques = new Set<string>();
  // ponytail: distância de render (fog + camera.far) — 0.3..1, estilo GTA
  renderDistance = 1;
  setRenderDistance(pct: number) {
    this.renderDistance = Math.min(1, Math.max(0.25, pct));
    const far = 60 + this.renderDistance * 160; // 100..220
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = far * 0.35;
      this.scene.fog.far = far;
    }
  }
  setLockedRooms(ids: string[]) {
    this.lockedRooms = new Set(ids);
    for (const d of this.env.doors) {
      const id = d.roomId;
      if (!id || id === 'COPA' || this.serverPlaques.has(id)) continue;
      this.env.plaques.find((p) => p.roomId === id)?.setText(
        this.lockedRooms.has(id) ? '🔒 À VENDA' : '',
      );
    }
    // sala trancada fica vazia p/ economizar
    for (const roomId of ['W1', 'W2', 'W3', 'E1', 'E2', 'E3'])
      this.env.setRoomProps(roomId, !this.lockedRooms.has(roomId));
  }
  doorBlocked(x: number, z: number, r: number, feet: number) {
    for (const d of this.env.doors) {
      if (d.roomId && this.lockedRooms.has(d.roomId)) {
        if (d.plane === 'z') {
          if (Math.abs(z - d.z) < r + 0.08 && Math.abs(x - d.x) < d.half + r)
            return true;
        } else if (Math.abs(x - d.x) < r + 0.08 && Math.abs(z - d.z) < d.half + r)
          return true;
        continue;
      }
      if (feet > 0.5) continue;
      if (Math.abs(d.group.rotation.y) > 1.2) continue;
      if (d.plane === 'z') {
        if (Math.abs(z - d.z) < r + 0.08 && Math.abs(x - d.x) < d.half + r)
          return true;
      } else if (Math.abs(x - d.x) < r + 0.08 && Math.abs(z - d.z) < d.half + r)
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
  ensureTV() {
    // agora inicializado no constructor via this.env.copaTV.videoScreen
  }
  initTVAudio() {
    if (this.tvAudioCtx || !this.tvVideo) return;
    this.tvAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.tvAudioGain = this.tvAudioCtx.createGain();
    this.tvAudioGain.gain.value = this.tvVolume;
    this.tvAudioPanner = this.tvAudioCtx.createPanner();
    this.tvAudioPanner.panningModel = 'HRTF';
    this.tvAudioPanner.distanceModel = 'linear';
    this.tvAudioPanner.refDistance = 1;
    this.tvAudioPanner.maxDistance = 18;
    this.tvAudioPanner.rolloffFactor = 1;
    this.tvAudioPanner.positionX.value = 11;
    this.tvAudioPanner.positionY.value = 1.9;
    this.tvAudioPanner.positionZ.value = 18.34;
    this.tvAudioSource = this.tvAudioCtx.createMediaElementSource(this.tvVideo);
    this.tvAudioSource.connect(this.tvAudioPanner).connect(this.tvAudioGain).connect(this.tvAudioCtx.destination);
    this.tvVideo.volume = 1; // controlado pelo gain
  }
  drawTVScreen() {
    if (!this.tvVideoCanvas || !this.tvVideoCtx || !this.tvVideoTex) return;
    const ctx = this.tvVideoCtx;
    ctx.fillStyle = '#0b0f12';
    ctx.fillRect(0, 0, 512, 288);
    if (this.tvVideo && this.tvVideo.readyState >= 2) {
      ctx.drawImage(this.tvVideo, 0, 0, 512, 288);
    } else {
      ctx.fillStyle = '#ff0033';
      ctx.beginPath();
      ctx.roundRect(24, 24, 64, 44, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(44, 32); ctx.lineTo(66, 46); ctx.lineTo(44, 60); ctx.fill();
      ctx.fillStyle = '#ffe9c8';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Carregando vídeo…', 100, 55);
    }
    // equalizador fake
    for (let i = 0; i < 32; i++) {
      const h = 20 + Math.random() * 120;
      ctx.fillStyle = i % 3 ? '#39d353' : '#ffd166';
      ctx.fillRect(24 + i * 15, 250 - h, 10, h);
    }
    ctx.fillStyle = '#7fd6c2';
    ctx.font = '20px sans-serif';
    ctx.fillText(this.tvPlaying ? '🔊 Som 3D — chegue perto' : '🔇 TV desligada — flip o switch', 24, 278);
    this.tvVideoTex.needsUpdate = true;
  }
  updateTV(dt: number) {
    if (!this.tvVideo || !this.tvVideoScreen) return;
    this.tvClock -= dt;
    if (this.tvClock > 0) return;
    this.tvClock = 0.5;

    // distância 3D real (x, y, z) para falloff suave
    const p = this.camera.position;
    const dx = p.x - 11;
    const dy = p.y - 1.9;
    const dz = p.z - 18.34;
    const d = Math.hypot(dx, dy, dz);

    // falloff linear suave: 1 em 2m → 0 em 20m; também atenuado por paredes/portas
    let vol = this.tvPlaying ? Math.max(0, 1 - (d - 2) / 18) : 0;

    // atenuação extra se não estiver na copa nem no beco (paredes)
    const b = this.env.copaBounds;
    const inCopa = !!b && p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;
    const inBeco = p.x > 4 && p.x < 6 && p.z > 13.5 && p.z < 18.5;
    const inE1 = p.x > 4 && p.x < 11 && p.z > 6.6 && p.z < 9.5; // sala E1 adjacente
    if (!inCopa && !inBeco && !inE1) vol *= 0.15; // -85% através da parede

    vol = Math.max(0, Math.min(1, vol)) * this.tvVolume;
    if (this.tvAudioGain) this.tvAudioGain.gain.value = vol;
    if (this.tvVideo) this.tvVideo.volume = 1; // gain controla

    // atualiza posição do panner (TV fixa)
    if (this.tvAudioPanner) {
      this.tvAudioPanner.positionX.value = 11;
      this.tvAudioPanner.positionY.value = 1.9;
      this.tvAudioPanner.positionZ.value = 18.34;
    }

    this.drawTVScreen();
  }
  // ponytail: NPC respeita porta fechada E móveis (não atravessa mesa/balcão); raio menor que o do jogador
  npcBlocked(x: number, z: number, r = 0.26) {
    if (this.doorBlocked(x, z, r, 0)) return true;
    return this.env.colliders.some(
      (c) => x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ,
    );
  }
  npcStep(g: { position: { x: number; z: number } }, dx: number, dz: number) {
    const nx = g.position.x + dx;
    if (!this.npcBlocked(nx, g.position.z)) g.position.x = nx;
    const nz = g.position.z + dz;
    if (!this.npcBlocked(g.position.x, nz)) g.position.z = nz;
  }
  updateCopaVapor(dt: number) {
    if (!this.copaVapor) return;
    const hasCook = this.hasCooks;
    this.copaVapor.visible = hasCook;
    if (!hasCook) return;
    for (const puff of this.copaVapor.children as THREE.Mesh[]) {
      const mat = puff.material as THREE.MeshBasicMaterial;
      puff.position.y += dt * 0.22;
      puff.position.x += Math.sin(this.elapsed * 0.9 + (puff.userData.phase as number)) * 0.002;
      mat.opacity = 0.25 * (1 - (puff.position.y - (puff.userData.baseY as number)) / 1.2);
      if (puff.position.y - (puff.userData.baseY as number) > 1.1) {
        puff.position.y = puff.userData.baseY as number;
        mat.opacity = 0.25;
      }
    }
    // cozinheira mexe os braços (cozinhando) quando na cantina
    for (const [id, g] of this.hiredWorkers) {
      const h = [...this.hiredNames.keys()].includes(id) ? id : null;
      if (!h) continue;
      const isCook = this.hiredWorkers.get(id) && this.hasCooks;
      const atCounter = Math.hypot(g.position.x - 15.4, g.position.z - 16) < 0.8;
      if (isCook && atCounter) {
        const l = g.userData.limbs as { armL: THREE.Group; armR: THREE.Group } | undefined;
        if (l) {
          l.armL.rotation.x = Math.sin(this.elapsed * 4.2) * 0.6 - 0.2;
          l.armR.rotation.x = Math.cos(this.elapsed * 4.2) * 0.6 - 0.2;
        }
      }
    }
  }
  // ponto 1m à frente; válido se dentro do mapa e fora de parede/vidro/porta/móvel
  dropPoint() {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    return { x: this.camera.position.x + fx, z: this.camera.position.z + fz };
  }
  dropValid(x: number, z: number) {
    if (x < -23 || x > 23 || z < -41 || z > 18) return false;
    if (this.doorBlocked(x, z, 0.28, 0)) return false;
    return !this.env.colliders.some(
      (c) => x + 0.28 > c.minX && x - 0.28 < c.maxX && z + 0.28 > c.minZ && z - 0.28 < c.maxZ,
    );
  }
  updatePlayer(dt: number) {
    // conversando: pode olhar, mas não anda (letras respondem o chat)
    const f = this.chatOpen
      ? 0
      : (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
        (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const r = this.chatOpen
      ? 0
      : (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
        (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    this.crouching = this.keys.has('KeyC');
    // agachado não corre e reduz altura de colisão; lerp para câmera suave
    this.crouchLerp += ((this.crouching ? 1 : 0) - this.crouchLerp) * (1 - Math.exp(-dt * 10));
    this.sprinting = this.keys.has('ShiftLeft') && f > 0 && !this.crouching;
    const speed = (this.sprinting ? 6.1 : this.crouching ? 2.0 : 3.8) * (this.dollyGrabbed ? 0.6 : 1);
    const v = new THREE.Vector3(r, 0, -f);
    if (v.length() > 0) v.normalize();
    v.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).multiplyScalar(
      speed,
    );
    this.velocity.lerp(v, 1 - Math.exp(-dt * 13));
    // agachado tem raio menor (passa por vãos estreitos)
    this.move(
      this.camera.position,
      this.velocity.x * dt,
      this.velocity.z * dt,
      0.32 - this.crouchLerp * 0.10,
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
      1.7 -
      this.crouchLerp * 0.7 +
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
  halfCorridor() {
    return 1.5;
  }
  updateDoors(dt: number) {
    const k = 1 - Math.exp(-dt * 9);
    // ponytail: NPCs (bots + devs) também abrem portas no caminho
    const bodies: { x: number; z: number }[] = [this.camera.position];
    for (const [, g] of this.bots ?? []) bodies.push(g.position);
    for (const [, g] of this.devs ?? []) bodies.push(g.position);
    for (const [, g] of this.receps ?? []) bodies.push(g.position);
    for (const [, g] of this.hiredWorkers ?? []) bodies.push(g.position);
    for (const [, g] of this.techs ?? []) bodies.push(g.position);
    for (const d of this.env.doors) {
      if (d.roomId && this.lockedRooms.has(d.roomId)) {
        d.group.rotation.y += (0 - d.group.rotation.y) * k;
        continue;
      }
      let target = 0;
      for (const b of bodies) {
        const dist = Math.hypot(b.x - d.x, b.z - d.z);
        if (dist < 1.2) {
          const fromRoom =
            d.plane === 'x'
              ? Math.abs(b.x) > this.halfCorridor()
              : b.z > d.z;
          target = (fromRoom ? -d.side : d.side) * (d.plane === 'z' ? -1 : 1) * 1.55;
          break;
        }
      }
      d.group.rotation.y += (target - d.group.rotation.y) * k;
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
      if (d < 1.2 && toSwitch.normalize().dot(forward) > 0.9) {
        this.target = r;
        prompt = `PRESSIONE E PARA ${r.on ? 'DESLIGAR' : 'LIGAR'} A LUZ`;
      }
    }
    for (const c of this.env.corridorLights)
      c.light.visible = Math.abs(this.camera.position.z - c.z) < 10;
    this.notebookTarget = null;
    for (const n of this.env.notebooks) {
      // sem máquina (ou quebrada): sem prompt, sem acesso
      if (this.roomsPC && !this.roomsPC[n.roomId]) continue;
      const toNb = new THREE.Vector3(
        n.x - this.camera.position.x,
        n.y - this.camera.position.y,
        n.z - this.camera.position.z,
      );
      const d = toNb.length();
      if (d < 1.5 && toNb.normalize().dot(forward) > 0.85) {
        this.notebookTarget = n;
        prompt = 'PRESSIONE E OU CLIQUE PARA ACESSAR O NOTEBOOK';
      }
    }
    // ponytail: porta de sala trancada — mira de perto avisa (sem E, sem entrada)
    if (!prompt) {
      for (const d of this.env.doors) {
        if (!d.roomId || !this.lockedRooms.has(d.roomId)) continue;
        const toD = new THREE.Vector3(
          d.x - this.camera.position.x,
          1.2 - this.camera.position.y,
          d.z - this.camera.position.z,
        );
        if (toD.length() < 1.8 && toD.normalize().dot(forward) > 0.9) {
          prompt = `🔒 SALA ${d.roomId} TRANCADA — alugue no Empresa 🛍️`;
          break;
        }
      }
    }
    // ponytail: 3 interruptores "chamar próximo" no balcão da recepção
    this.callTarget = false;
    const switches = this.env.receptionSwitches ?? [];
    for (const s of switches) {
      const toSw = new THREE.Vector3(
        s.x - this.camera.position.x,
        s.y - this.camera.position.y,
        s.z - this.camera.position.z,
      );
      const d = toSw.length();
      if (d < 1.6 && toSw.normalize().dot(forward) > 0.9) {
        this.callTarget = true;
        prompt = 'PRESSIONE E OU CLIQUE PARA CHAMAR O PRÓXIMO';
        break;
      }
    }
    // ponytail: switch da TV da copa (liga/desliga vídeo + áudio, persiste na sala)
    this.tvSwitchTarget = false;
    if (this.tvSwitchGroup?.visible !== false) {
      const toTV = new THREE.Vector3(
        12.8 - this.camera.position.x,
        1.9 - this.camera.position.y,
        18.35 - this.camera.position.z,
      );
      if (toTV.length() < 2.2 && toTV.normalize().dot(forward) > 0.9) {
        this.tvSwitchTarget = true;
        prompt = `PRESSIONE E PARA ${this.tvPlaying ? 'DESLIGAR' : 'LIGAR'} A TV 📺`;
      }
    }
    // ponytail: clique no cliente chamado abre o atendimento (mesmo padrao de mira)
    this.hoverBotId = null;
    const botList: Map<string, THREE.Group> = this.bots ?? new Map();
    for (const [id, g] of botList) {
      if (this.botStates?.get(id) !== 'called') continue;
      const toB = new THREE.Vector3(
        g.position.x - this.camera.position.x,
        1.2 - this.camera.position.y,
        g.position.z - this.camera.position.z,
      );
      const d = toB.length();
      if (d < 2.4 && toB.normalize().dot(forward) > 0.88) {
        this.hoverBotId = id;
        prompt = `CLIQUE PARA CONVERSAR COM ${this.botLabels.get(id) ?? 'CLIENTE'}`;
        break;
      }
    }
    // ponytail: mira num funcionário trabalhando = chamar (E) — prioridade sobre caixa
    this.hoverHiredId = null;
    for (const [id, g] of this.hiredWorkers ?? new Map<string, THREE.Group>()) {
      const toH = new THREE.Vector3(
        g.position.x - this.camera.position.x,
        1.2 - this.camera.position.y,
        g.position.z - this.camera.position.z,
      );
      const d = toH.length();
      if (d < 2.4 && toH.normalize().dot(forward) > 0.88) {
        this.hoverHiredId = id;
        const nm = (this.hiredNames.get(id) ?? 'FUNCIONÁRIO').toUpperCase();
        const waiting = this.hiredWaiting.get(id);
        prompt = waiting
          ? `E PARA FALAR COM ${nm} (${waiting === 'raise' ? '📢 AUMENTO' : '📝 DEMISSÃO'})`
          : id === this.calledHiredId ? `E PARA LIBERAR ${nm} (P DEMITE)` : `PRESSIONE E PARA CHAMAR ${nm}`;
        break;
      }
    }
    // ponytail: carrinho largado no chão = pegar (E)
    this.dollyTarget = null;
    if (!this.dollyGrabbed && this.dolly?.visible) {
      const toD = new THREE.Vector3(
        this.dolly.position.x - this.camera.position.x,
        0.5 - this.camera.position.y,
        this.dolly.position.z - this.camera.position.z,
      );
      if (toD.length() < 2 && toD.normalize().dot(forward) > 0.85) {
        this.dollyTarget = 'grab';
        if (!this.hoverHiredId) prompt = 'PRESSIONE E PARA PEGAR O CARRINHO 🛒';
      }
    }
    // ponytail: caixas do estoque (pegar) e estações livres (instalar)
    this.boxTarget = null;
    // mão → carrinho: mirou no dolly com caixa na mão (fantasma some; E põe em cima)
    if (!this.hoverHiredId && this.handBoxId && this.dolly?.visible && !this.dollyGrabbed && this.dollyLoad.length < 3) {
      const toD = new THREE.Vector3(
        this.dolly.position.x - this.camera.position.x,
        0.5 - this.camera.position.y,
        this.dolly.position.z - this.camera.position.z,
      );
      if (toD.length() < 2.2 && toD.normalize().dot(forward) > 0.9) {
        this.boxTarget = { kind: 'load' };
        prompt = 'PRESSIONE E PARA COLOCAR NO CARRINHO 🛒';
      }
    }
    if (this.hoverHiredId || this.boxTarget) {
      if (this.dropGhost) this.dropGhost.visible = false;
    } else {
    const pkgList: Map<string, THREE.Group> = this.pkgs ?? new Map();
    const stock: ('ok' | 'broken' | 'empty')[] = this.stockStations ?? [];
    if (this.carryBoxId) {
      const stations = this.env.devStations ?? [];
      for (let i = 0; i < stations.length; i++) {
        if (stock[i] !== 'empty') continue;
        const st = stations[i];
        const toS = new THREE.Vector3(
          st.x - this.camera.position.x,
          1.0 - this.camera.position.y,
          st.z - this.camera.position.z,
        );
        if (toS.length() < 1.8 && toS.normalize().dot(forward) > 0.85) {
          this.boxTarget = { kind: 'place', idx: i };
          prompt = `PRESSIONE E PARA INSTALAR NA ESTAÇÃO ${i + 1}`;
          break;
        }
      }
      // ...ou na mesa de uma sala sem computador
      if (!this.boxTarget) {
        for (const n of this.env.notebooks) {
          if (n.roomId.startsWith('REC')) continue;
          if (this.roomsPC && this.roomsPC[n.roomId] !== false) continue;
          const toN = new THREE.Vector3(
            n.x - this.camera.position.x,
            n.y - this.camera.position.y,
            n.z - this.camera.position.z,
          );
          if (toN.length() < 1.8 && toN.normalize().dot(forward) > 0.85) {
            this.boxTarget = { kind: 'placeroom', roomId: n.roomId };
            prompt = `PRESSIONE E PARA INSTALAR NA SALA ${n.roomId}`;
            break;
          }
        }
      }
      // ...ou larga no chão onde está (quadrado verde = pode, vermelho = bloqueado)
      if (!this.boxTarget) {
        const dp = this.dropPoint();
        this.dropOk = this.dropValid(dp.x, dp.z);
        if (this.dropGhost) {
          this.dropGhost.visible = this.state.mode === 'playing';
          this.dropGhost.position.set(dp.x, 0.02, dp.z);
          (this.dropGhost.material as THREE.MeshBasicMaterial).color.set(this.dropOk ? 0x39d353 : 0xff4444);
        }
        this.boxTarget = { kind: 'drop' };
        prompt = this.dropOk ? 'PRESSIONE E PARA LARGAR A CAIXA AQUI' : 'AÍ NÃO DÁ PRA LARGAR 🚫';
      }
    } else {
      if (this.dropGhost) this.dropGhost.visible = false;
      for (const [id, g] of pkgList) {
        const toP = new THREE.Vector3(
          g.position.x - this.camera.position.x,
          0.4 - this.camera.position.y,
          g.position.z - this.camera.position.z,
        );
        if (toP.length() < 1.5 && toP.normalize().dot(forward) > 0.85) {
          this.boxTarget = { kind: 'pickup', id };
          prompt = `PRESSIONE E PARA PEGAR ${this.pkgLabels.get(id) ?? 'A CAIXA'}`;
          break;
        }
      }
    }
    } // ponytail: fim do bloco de caixas (pulado ao mirar funcionário)
    // carrinho na mão: segue 1.1m à frente do jogador
    if (this.dolly) {
      if (this.dollyGrabbed) {
        const fx = -Math.sin(this.yaw);
        const fz = -Math.cos(this.yaw);
        this.dolly.position.set(
          this.camera.position.x + fx * 1.1,
          0,
          this.camera.position.z + fz * 1.1,
        );
        this.dolly.rotation.y = this.yaw;
      }
    }
    this.state.prompt = prompt;
  }
  closeRequestTalk() {
    this.requestTalkId = null;
    this.state.requestTalk = null;
    this.emit();
  }
  // ponytail: E/clique num só lugar (teclado + mouse usam o mesmo fluxo)
  topBox(): string | null {
    // topo do carrinho primeiro, depois a mão
    if (this.dollyLoad.length) return this.dollyLoad[this.dollyLoad.length - 1];
    return this.handBoxId ?? this.carryBoxId;
  }
  setDollyOwned(owned: boolean) {
    if (this.dolly) this.dolly.visible = owned;
    if (!owned && this.dollyGrabbed) this.dollyGrabbed = false;
  }
  // ponytail: carrinho persiste por sala — servidor guarda x/z ao soltar, cliente restaura ao entrar
  onDollyPos: ((x: number, z: number) => void) | null = null;
  setDollyPos(x: number, z: number) {
    if (!this.dolly || this.dollyGrabbed) return;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.dolly.position.set(
      Math.min(23, Math.max(-23, x)), 0, Math.min(18, Math.max(-41, z)),
    );
  }
  grabDolly() {
    if (!this.dolly?.visible) return;
    this.dollyGrabbed = true;
    this.sound.noise(0.05, 0.1, 900);
  }
  releaseDolly() {
    this.dollyGrabbed = false;
    if (this.dolly) this.onDollyPos?.(this.dolly.position.x, this.dolly.position.z);
    this.sound.noise(0.05, 0.1, 900);
  }
  pressE() {
    if (this.notebookTarget) {
      this.enterDesktop();
    } else if (this.hoverBotId) {
      this.onBotClick?.(this.hoverBotId);
      this.sound.noise(0.05, 0.1, 900);
    } else if (this.hoverHiredId) {
      const waiting = this.hiredWaiting.get(this.hoverHiredId);
      if (waiting) {
        // conversa do RH: abre o painel (responder por lá)
        this.requestTalkId = this.hoverHiredId;
        this.state.requestTalk = { id: this.hoverHiredId, name: this.hiredNames.get(this.hoverHiredId) ?? 'Funcionário', kind: waiting };
        this.emit();
      } else if (this.hoverHiredId === this.calledHiredId) this.onReleaseEmployee?.(this.hoverHiredId);
      else this.onCallEmployee?.(this.hoverHiredId);
      this.sound.noise(0.05, 0.1, 900);
    } else if (this.tvSwitchTarget) {
      this.toggleTV();
    } else if (this.boxTarget) {
      const bt = this.boxTarget;
      if (bt.kind === 'pickup') {
        if (this.dollyGrabbed && this.dollyLoad.length >= 3) {
          this.onNotice?.('Carrinho cheio (3 caixas).');
          this.sound.noise(0.15, 0.12, 180);
          return;
        }
        if (!this.dollyGrabbed && this.handBoxId) {
          this.onNotice?.('Mão ocupada — ponha no carrinho ou largue antes.');
          this.sound.noise(0.15, 0.12, 180);
          return;
        }
        this.onPickupBox?.(bt.id);
      } else if (bt.kind === 'load') {
        // mão → carrinho (continua claimed; gruda no dolly)
        if (this.handBoxId && this.dollyLoad.length < 3 && !this.dollyLoad.includes(this.handBoxId)) {
          this.dollyLoad.push(this.handBoxId);
          this.sound.noise(0.05, 0.1, 900);
        }
      } else {
        const top = this.topBox();
        if (!top) {
          if (this.dollyGrabbed) this.releaseDolly();
          return;
        }
        if (bt.kind === 'drop') {
          if (this.dropOk) {
            const dp = this.dropPoint();
            this.onDropBox?.(top, dp.x, dp.z);
          } else {
            this.onNotice?.('Aí não dá pra largar — mira num ponto livre.');
            this.sound.noise(0.15, 0.12, 180);
            return;
          }
        } else
          this.onPlaceBox?.(
            top,
            bt.kind === 'place' ? bt.idx : null,
            bt.kind === 'placeroom' ? bt.roomId : null,
          );
      }
      this.sound.noise(0.05, 0.1, 900);
    } else if (this.dollyTarget === 'grab') {
      this.grabDolly();
    } else if (this.dollyGrabbed) {
      this.releaseDolly(); // E no vazio com carrinho: solta onde está
    } else if (this.callTarget) {
      this.onCallNext?.();
      this.sound.noise(0.05, 0.1, 900);
    } else {
      this.toggleTargetRoom();
    }
  }
  toggleTargetRoom() {
    const r = this.target;
    if (!r) return;
    if (this.onToggleLight) this.onToggleLight(r.roomId, !r.on);
    else this.applyLight(r.roomId, !r.on);
    this.sound.noise(0.05, 0.1, 900);
  }
  npcMats = new Map<number, THREE.MeshStandardMaterial>();
  npcTagMats = new Map<string, THREE.MeshBasicMaterial>();
  npcBodyMat(color: number) {
    let m = this.npcMats.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
      this.npcMats.set(color, m);
    }
    return m;
  }
  npcTagMat(username: string) {
    const key = username.slice(0, 12);
    let m = this.npcTagMats.get(key);
    if (!m) {
      // etiqueta por nome com teto (nomes são únicos; evita texturas infinitas)
      if (this.npcTagMats.size > 80) {
        const oldest = this.npcTagMats.keys().next().value!;
        this.npcTagMats.get(oldest)?.map?.dispose();
        this.npcTagMats.get(oldest)?.dispose();
        this.npcTagMats.delete(oldest);
      }
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0b0f12';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#7fd6c2';
      ctx.font = '32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(key, 128, 42);
      m = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true });
      this.npcTagMats.set(key, m);
    }
    return m;
  }
  makeRemote(username: string, variantOrColor: FigureVariantId | number = 0x35506b) {
    const pal = typeof variantOrColor === 'string'
      ? (FIGURE_VARIANTS.find((v) => v.id === variantOrColor) ?? FIGURE_VARIANTS[0])
      : { id: 'custom', name: '', shirt: variantOrColor, pants: 0x1c2733, skin: 0xd9b48c };
    const g = new THREE.Group();
    const shirt = this.npcBodyMat(pal.shirt);
    const pants = this.npcBodyMat(pal.pants);
    const skin = this.npcBodyMat(pal.skin);
    // pernas (pivô no quadril p/ walk swing + sentar)
    const legL = new THREE.Group(), legR = new THREE.Group();
    legL.position.set(-0.11, 0.5, 0);
    legR.position.set(0.11, 0.5, 0);
    const legMeshL = new THREE.Mesh(FIG_LEG_GEO, pants);
    legMeshL.position.y = -0.25;
    legMeshL.castShadow = true;
    const legMeshR = new THREE.Mesh(FIG_LEG_GEO, pants);
    legMeshR.position.y = -0.25;
    legMeshR.castShadow = true;
    legL.add(legMeshL);
    legR.add(legMeshR);
    // tronco + cabeça
    const torso = new THREE.Mesh(FIG_TORSO_GEO, shirt);
    torso.position.y = 0.78;
    torso.castShadow = true;
    const head = new THREE.Mesh(FIG_HEAD_GEO, skin);
    head.position.y = 1.2;
    head.castShadow = true;
    // braços (pivô no ombro p/ walk swing)
    const armL = new THREE.Group(), armR = new THREE.Group();
    armL.position.set(-0.31, 1.02, 0);
    armR.position.set(0.31, 1.02, 0);
    const armMeshL = new THREE.Mesh(FIG_LIMB_GEO, shirt);
    armMeshL.position.y = -0.24;
    armMeshL.castShadow = true;
    const armMeshR = new THREE.Mesh(FIG_LIMB_GEO, shirt);
    armMeshR.position.y = -0.24;
    armMeshR.castShadow = true;
    const handL = new THREE.Mesh(FIG_HEAD_GEO, skin);
    handL.scale.setScalar(0.45);
    handL.position.y = -0.52;
    const handR = handL.clone();
    armL.add(armMeshL, handL);
    armR.add(armMeshR, handR);
    const body = new THREE.Group();
    body.add(legL, legR, torso, head, armL, armR);
    g.add(body);
    g.userData.body = body;
    if (typeof variantOrColor === 'string') this.tryLoadFig(g, variantOrColor);
    const tag = new THREE.Mesh(NPC_TAG_GEO, this.npcTagMat(username));
    tag.position.y = 1.68;
    g.add(tag);
    g.userData.tag = tag;
    g.userData.limbs = { armL, armR, legL, legR };
    g.userData.phase = Math.random() * Math.PI * 2;
    return g;
  }
  // ponytail: Blocky FBX opcional (lazy, cacheado) — falhou/ausente mantém o humanoide procedural
  figCache = new Map<string, THREE.Group | null>();
  figPending = new Map<string, THREE.Group[]>();
  figLoading = false;
  tryLoadFig(g: THREE.Group, variant: FigureVariantId) {
    const cached = this.figCache.get(variant);
    if (cached === null) return; // já falhou
    if (cached) { this.attachFig(g, cached); return; }
    const list = this.figPending.get(variant) ?? [];
    list.push(g);
    this.figPending.set(variant, list);
    if (this.figLoading) return;
    this.figLoading = true;
    void (async () => {
      try {
        const [{ FBXLoader }] = await Promise.all([import('three/addons/loaders/FBXLoader.js')]);
        const loader = new FBXLoader();
        for (const v of FIGURE_VARIANTS.map((x) => x.id)) {
          const file = FBX_MAP[v];
          try {
            const fbx = await loader.loadAsync(`/characters/${file}`);
            fbx.updateMatrixWorld(true);
            let box = new THREE.Box3().setFromObject(fbx);
            const size = box.getSize(new THREE.Vector3());
            if (size.y > 0.01) fbx.scale.multiplyScalar(1.72 / size.y);
            fbx.updateMatrixWorld(true);
            box = new THREE.Box3().setFromObject(fbx);
            fbx.position.y -= box.min.y;
            fbx.traverse((o) => {
              const m = o as THREE.Mesh;
              if (m.isMesh) {
                m.castShadow = true;
                m.receiveShadow = true;
                if (m.material) {
                  const mat = m.material as THREE.MeshStandardMaterial;
                  if (mat.map) mat.color.set(0xffffff);
                }
              }
            });
            this.figCache.set(v, fbx);
            for (const g of this.figPending.get(v) ?? []) this.attachFig(g, fbx);
          } catch {
            this.figCache.set(v, null);
            for (const g of this.figPending.get(v) ?? []) g.userData.figFailed = true;
          }
          this.figPending.delete(v);
        }
      } catch {
        for (const [, list] of this.figPending) for (const g of list) g.userData.figFailed = true;
        this.figPending.clear();
      } finally {
        this.figLoading = false;
      }
    })();
  }
  attachFig(g: THREE.Group, src: THREE.Group) {
    if (g.userData.hasFig) return;
    g.userData.hasFig = true;
    const body = g.userData.body as THREE.Group | undefined;
    if (body) body.visible = false; // some o humanoide, entra o blocky
    const clone = src.clone(true);
    clone.rotation.y = FBX_FACE_OFFSET;
    g.add(clone);
  }
  // ponytail: walk swing + perna dobrada ao sentar — 1 chamada por NPC por frame
  poseFig(g: THREE.Group, moving: boolean, seated: boolean) {
    const l = g.userData.limbs as
      | { armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group }
      | undefined;
    if (!l) return;
    if (seated) {
      l.legL.rotation.x = -1.25;
      l.legR.rotation.x = -1.25;
      l.armL.rotation.x = -0.35;
      l.armR.rotation.x = -0.35;
      return;
    }
    const s = moving ? Math.sin(this.elapsed * 9 + (g.userData.phase as number)) * 0.55 : 0;
    const k = 1 - Math.exp(-0.2);
    l.armL.rotation.x += (s - l.armL.rotation.x) * k;
    l.armR.rotation.x += (-s - l.armR.rotation.x) * k;
    l.legL.rotation.x += (-s - l.legL.rotation.x) * k;
    l.legR.rotation.x += (s - l.legR.rotation.x) * k;
  }
  setRemotePlayers(
    players: {
      id: string;
      username: string;
      character?: string;
      x: number;
      z: number;
      yaw: number;
      y?: number;
      crouch?: boolean;
      using?: string | null;
    }[],
  ) {
    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.id);
      this.remoteNames.set(p.id, p.username);
      this.remoteTargets.set(p.id, {
        x: p.x,
        z: p.z,
        yaw: p.yaw,
        y: p.y ?? 0,
        crouch: p.crouch ?? false,
        using: p.using ?? null,
      });
      if (!this.remotes.has(p.id)) {
        const g = this.makeRemote(p.username, (p.character as FigureVariantId | undefined) ?? variantForId(p.id));
        this.remotes.set(p.id, g);
        this.remoteGroup.add(g);
        g.position.set(p.x, p.y ?? 0, p.z);
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
      const bx = g.position.x, bz = g.position.z;
      // usando notebook: senta na cadeira do PC (todos veem)
      const seat = t.using ? this.env.seats[t.using] : undefined;
      const tx = seat ? seat.x : t.x;
      const tz = seat ? seat.z : t.z;
      g.position.x += (tx - g.position.x) * k;
      g.position.z += (tz - g.position.z) * k;
      const crouched = !!t.crouch && !seat;
      const targetY = seat ? -0.18 : (t.y ?? 0) - (crouched ? 0.35 : 0);
      g.position.y += (targetY - g.position.y) * k;
      if (crouched) g.scale.y += (0.72 - g.scale.y) * k;
      else g.scale.y += (1 - g.scale.y) * k;
      if (seat) g.rotation.y += (seat.ry - g.rotation.y) * k;
      const moving = Math.hypot(tx - bx, tz - bz) > 0.02;
      this.poseFig(g, moving && !crouched && !seat, crouched || !!seat);
      const tag = g.userData.tag as THREE.Mesh | undefined;
      if (tag) {
        tag.quaternion.copy(this.camera.quaternion);
        tag.position.y = seat ? 1.38 : crouched ? 1.32 : 1.68;
      }
    }
  }
  // ponytail: bots-clientes da recepcao (server-authoritative, so render).
  // Entram pela porta sul, andam até o banco (sentam), vão ao balcão quando
  // chamados e saem pela porta ao dispensar/fechar.
  setCompanyBots(
    queue: { id: string; ticket: number; name: string; state: string }[],
    attending: { id: string; ticket: number; name: string } | null,
    serving: number | null,
  ) {
    const spots = this.env.receptionSpots ?? [];
    const counter = this.env.receptionCounter ?? { x: 0, z: -27.7 };
    const door = this.env.botDoor ?? { x: 4.2, z: -27.5 };
    const seen = new Set<string>();
    const place = (id: string, label: string, state: string, x: number, z: number, sit: boolean, color: number) => {
      seen.add(id);
      this.botStates.set(id, state);
      this.botLabels.set(id, label);
      const w = this.botWalk.get(id);
      if (!this.bots.has(id)) {
        const g = this.makeRemote(label, color);
        this.bots.set(id, g);
        this.botGroup.add(g);
        g.position.set(door.x, 0, door.z);
        this.botWalk.set(id, { wx: [x], wz: [z], tx: x, tz: z, ty: sit ? -0.2 : 0, leaving: false });
      } else if (w && (Math.abs(w.tx - x) > 0.01 || Math.abs(w.tz - z) > 0.01)) {
        w.wx = [x];
        w.wz = [z];
        w.tx = x;
        w.tz = z;
        w.ty = sit ? -0.2 : 0;
        w.leaving = false;
      } else if (w) {
        w.ty = sit ? -0.2 : 0;
      }
    };
    queue.forEach((b, i) => {
      const called = b.state === 'called';
      const s = called ? counter : (spots[i % spots.length] ?? counter);
      place(b.id, `S${b.ticket} ${b.name}`, b.state, s.x, s.z, !called, called ? 0x6b8f3e : 0x8a6b3d);
    });
    if (attending)
      place(attending.id, `S${attending.ticket} ${attending.name}`, 'attending', counter.x, counter.z, false, 0x6b8f3e);
    for (const [id, g] of this.bots)
      if (!seen.has(id)) {
        this.botStates.delete(id);
        this.botLabels.delete(id);
        const w = this.botWalk.get(id);
        if (w && !w.leaving) {
          // vai embora pela porta antes de sumir
          w.wx = [door.x];
          w.wz = [door.z];
          w.tx = door.x;
          w.tz = door.z;
          w.ty = 0;
          w.leaving = true;
        } else if (!w) {
          this.botGroup.remove(g);
          this.bots.delete(id);
        }
      }
    this.env.setReception(serving, queue.length);
  }
  updateBots(dt: number) {
    const speed = 1.4; // m/s andando
    const ky = 1 - Math.exp(-dt * 6);
    const counter = this.env.receptionCounter ?? { x: 0, z: -27.7 };
    for (const [id, g] of this.bots) {
      const w = this.botWalk.get(id);
      if (w && w.wx.length) {
        const dx = w.wx[0] - g.position.x;
        const dz = w.wz[0] - g.position.z;
        const d = Math.hypot(dx, dz);
        const step = speed * dt;
        if (d <= Math.max(step, 0.08)) {
          g.position.x = w.wx[0];
          g.position.z = w.wz[0];
          w.wx.shift();
          w.wz.shift();
          if (!w.wx.length && w.leaving) {
            this.botGroup.remove(g);
            this.bots.delete(id);
            this.botWalk.delete(id);
            this.botStates.delete(id);
            this.botLabels.delete(id);
            continue;
          }
        } else {
          this.npcStep(g, (dx / d) * step, (dz / d) * step);
          g.rotation.y = Math.atan2(dx, dz);
        }
      }
      if (w) g.position.y += (w.ty - g.position.y) * ky;
      // parado: de frente para o balcão (espera) ou para a fila (atendendo)
      if (w && !w.wx.length && !w.leaving) {
        const waiting = this.botStates?.get(id) === 'waiting';
        const fx = waiting ? counter.x - g.position.x : g.position.x - counter.x;
        const fz = waiting ? counter.z - g.position.z : counter.z + 3 - g.position.z;
        if (Math.hypot(fx, fz) > 0.01) g.rotation.y = Math.atan2(fx, fz);
      }
      if (w) this.poseFig(g, w.wx.length > 0, w.ty < 0 && !w.wx.length);
      const tag = g.userData.tag as THREE.Mesh | undefined;
      if (tag) tag.quaternion.copy(this.camera.quaternion);
    }
  }
  // ponytail: devs contratados andam do spawn até a estação (server-authoritative, só render)
  setCompanyDevs(devs: { id: string; name: string }[]) {
    const stations = this.env.devStations ?? [];
    const seen = new Set<string>();
    devs.forEach((d, i) => {
      const st = stations[i % Math.max(1, stations.length)];
      if (!st) return;
      seen.add(d.id);
      const w = this.devWalk.get(d.id);
      const path = { wx: [0, 1.5, 3.2, st.x, st.x], wz: [9.5, 9, 6.6, 6.6, st.z], tx: st.x };
      if (!this.devs.has(d.id)) {
        const g = this.makeRemote(d.name, variantForId(d.id));
        g.position.set(0, 0, 15.6);
        g.rotation.y = Math.PI;
        this.devs.set(d.id, g);
        this.devGroup.add(g);
        this.devWalk.set(d.id, { ...path, ry: st.ry, leaving: false });
      } else if (w && (Math.abs((w.tx ?? st.x) - st.x) > 0.01 || w.leaving)) {
        this.devWalk.set(d.id, { ...path, ry: st.ry, leaving: false });
      }
    });
    for (const [id, g] of this.devs)
      if (!seen.has(id)) {
        // demitido/saiu: volta ao spawn e some (o notebook fica na estação)
        const w = this.devWalk.get(id);
        if (w && !w.leaving) {
          const p = g.position;
          this.devWalk.set(id, {
            wx: [p.x, 3.2, 1.5, 0, 0], wz: [6.6, 6.6, 9, 9.5, 15.6], tx: 0, ry: Math.PI, leaving: true,
          });
        } else if (!w) {
          this.devGroup.remove(g);
          this.devs.delete(id);
        }
      }
  }
  updateDevs(dt: number) {
    const speed = 1.4;
    const ky = 1 - Math.exp(-dt * 6);
    for (const [id, g] of this.devs) {
      const w = this.devWalk.get(id);
      if (w && w.wx.length) {
        const dx = w.wx[0] - g.position.x;
        const dz = w.wz[0] - g.position.z;
        const d = Math.hypot(dx, dz);
        const step = speed * dt;
        if (d <= Math.max(step, 0.08)) {
          g.position.x = w.wx[0];
          g.position.z = w.wz[0];
          w.wx.shift();
          w.wz.shift();
          if (!w.wx.length) {
            if (w.leaving) {
              this.devGroup.remove(g);
              this.devs.delete(id);
              this.devWalk.delete(id);
              continue;
            }
            g.rotation.y = w.ry;
          }
        } else {
          this.npcStep(g, (dx / d) * step, (dz / d) * step);
          g.rotation.y = Math.atan2(dx, dz);
        }
      }
      // sentado no banco ao chegar (em pé andando/saindo)
      const seated = w && !w.wx.length && !w.leaving;
      g.position.y += ((seated ? -0.15 : 0) - g.position.y) * ky;
      this.poseFig(g, !!w?.wx.length, !!seated);
      const tag = g.userData.tag as THREE.Mesh | undefined;
      if (tag) tag.quaternion.copy(this.camera.quaternion);
    }
  }
  // ponytail: recepcionistas contratadas andam do spawn até atrás do balcão (postos x -1.8/0/1.8)
  setCompanyReceps(receps: { id: string; name: string; post: number }[]) {
    const px = [-1.8, 0, 1.8];
    const seen = new Set<string>();
    receps.forEach((r) => {
      const x = px[r.post] ?? 0;
      seen.add(r.id);
      const w = this.recepWalk.get(r.id);
      if (!this.receps.has(r.id)) {
        const g = this.makeRemote(r.name, variantForId(r.id));
        g.position.set(0, 0, 15.6);
        g.rotation.y = Math.PI;
        this.receps.set(r.id, g);
        this.recepGroup.add(g);
        this.recepWalk.set(r.id, {
          wx: [0, 0, 3.4, 3.4, x], wz: [9.5, -24, -25, -29.4, -29.4], tx: x, ry: 0, leaving: false,
        });
      } else if (w && !w.leaving && Math.abs((w.tx ?? x) - x) > 0.01) {
        // trocou de posto: anda pela faixa atrás do balcão (sem atravessar o balcão)
        const p = this.receps.get(r.id)!.position;
        if (p.z < -24)
          this.recepWalk.set(r.id, { wx: [3.4, x], wz: [-29.4, -29.4], tx: x, ry: 0, leaving: false });
        else
          this.recepWalk.set(r.id, {
            wx: [p.x, 0, 3.4, 3.4, x], wz: [p.z, -24, -25, -29.4, -29.4], tx: x, ry: 0, leaving: false,
          });
      }
    });
    for (const [id, g] of this.receps)
      if (!seen.has(id)) {
        // demitida/sem posto: sai pela faixa lateral e some no spawn
        const w = this.recepWalk.get(id);
        if (w && !w.leaving) {
          const p = g.position;
          this.recepWalk.set(id, {
            wx: [3.4, 3.4, 0, 0], wz: [p.z, -25, -20, 15.6], tx: 0, ry: Math.PI, leaving: true,
          });
        } else if (!w) {
          this.recepGroup.remove(g);
          this.receps.delete(id);
        }
      }
  }
  updateReceps(dt: number) {
    const speed = 1.4;
    for (const [id, g] of this.receps) {
      const w = this.recepWalk.get(id);
      if (w && w.wx.length) {
        const dx = w.wx[0] - g.position.x;
        const dz = w.wz[0] - g.position.z;
        const d = Math.hypot(dx, dz);
        const step = speed * dt;
        if (d <= Math.max(step, 0.08)) {
          g.position.x = w.wx[0];
          g.position.z = w.wz[0];
          w.wx.shift();
          w.wz.shift();
          if (!w.wx.length) {
            if (w.leaving) {
              this.recepGroup.remove(g);
              this.receps.delete(id);
              this.recepWalk.delete(id);
              continue;
            }
            g.rotation.y = w.ry;
          }
        } else {
          this.npcStep(g, (dx / d) * step, (dz / d) * step);
          g.rotation.y = Math.atan2(dx, dz);
        }
      }
      this.poseFig(g, !!w?.wx.length, false);
      const tag = g.userData.tag as THREE.Mesh | undefined;
      if (tag) tag.quaternion.copy(this.camera.quaternion);
    }
  }
  // ponytail: colaboradores contratados (devs + recep) no horário comercial
  // spawnam na estação/balcão quando atWork=true, saem quando almoço/fim do dia
  setRhRoom(roomId: string | null) {
    this.rhRoom = roomId;
  }
  rhSpot() {
    const r = (this.env.rooms ?? []).find((x) => x.roomId === this.rhRoom);
    return r ? { x: r.x, z: r.z } : null;
  }
  lunchIds: string[] = [];
  hasCooks = false;
  setCompanyHired(hired: { id: string; name: string; role: string; atWork: boolean; workState: string; stationX: number; stationZ: number; stationRy: number; calledBy?: string | null; waitingRH?: 'raise' | 'resign' | null }[]) {
    const seen = new Set<string>();
    // almoço: com cozinheira o pessoal come na copa; sem, vai p/ casa
    this.hasCooks = hired.some((h) => h.role === 'cook');
    this.lunchIds = hired.filter((x) => !x.atWork && x.workState === 'lunch' && x.role !== 'cook').map((x) => x.id);
    // quem eu chamei = segue meu jogador (localId vem do welcome)
    const called = hired.find((h) => h.calledBy && h.calledBy === this.localId) ?? null;
    this.calledHiredId = called?.id ?? null;
    this.state.calledHired = called ? { id: called.id, name: called.name } : null;
    hired.forEach((h) => {
      seen.add(h.id);
      this.hiredNames.set(h.id, h.name);
      const wasCalled = this.hiredCalled.get(h.id);
      this.hiredCalled.set(h.id, h.calledBy ?? null);
      const wasWaiting = this.hiredWaiting.get(h.id);
      this.hiredWaiting.set(h.id, h.waitingRH ?? null);
      if ((wasCalled && !h.calledBy) || (wasWaiting && !h.waitingRH)) {
        // liberado/respondido: volta andando à estação/balcão
        const g = this.hiredWorkers.get(h.id);
        if (g) this.hiredWalk.set(h.id, { wx: [h.stationX], wz: [h.stationZ], ry: h.stationRy, leaving: false });
      }
      // com pedido no RH e trabalhando: anda até a sala e espera lá
      if (h.waitingRH && h.atWork && h.workState === 'working') {
        const spot = this.rhSpot();
        const g = this.hiredWorkers.get(h.id);
        if (spot && g && h.id !== this.calledHiredId) {
          const d = Math.hypot(g.position.x - spot.x, g.position.z - spot.z);
          if (d > 0.6) {
            const w = this.hiredWalk.get(h.id);
            if (!w || w.leaving || Math.abs((w.wx[0] ?? spot.x) - spot.x) > 0.01)
              this.hiredWalk.set(h.id, { wx: [spot.x], wz: [spot.z], ry: Math.PI, leaving: false });
          }
        }
      }
      const w = this.hiredWalk.get(h.id);
      if (h.role === 'manager' && h.atWork)
        this.mgrSeat.set(h.id, { x: h.stationX, z: h.stationZ, ry: h.stationRy });
      if (h.atWork && (h.workState === 'working')) {
        if (!this.hiredWorkers.has(h.id)) {
          let color = 0x4f7a5a;
          if (h.role === 'recep') color = 0x4a6b8f;
          else if (h.role === 'manager') color = 0x8b6b3a;
          else if (h.role === 'cook') color = 0xd0a040;
          const g = this.makeRemote(h.name, color);
          g.position.set(h.stationX, 0, h.stationZ);
          g.rotation.y = h.stationRy;
          this.hiredWorkers.set(h.id, g);
          this.hiredGroup.add(g);
          this.hiredWalk.set(h.id, { wx: [], wz: [], ry: h.stationRy, leaving: false });
        } else if (w && w.leaving) {
          // voltou do almoço: reaparece na estação
          this.hiredWalk.set(h.id, { wx: [], wz: [], ry: h.stationRy, leaving: false });
          const g2 = this.hiredWorkers.get(h.id);
          if (g2) {
            g2.position.set(h.stationX, 0, h.stationZ);
            g2.rotation.y = h.stationRy;
          }
        } else {
          // voltou (copa/RH): anda de volta ao posto se está longe
          const g2 = this.hiredWorkers.get(h.id);
          if (g2 && !h.calledBy && !h.waitingRH) {
            const d = Math.hypot(g2.position.x - h.stationX, g2.position.z - h.stationZ);
            const w2 = this.hiredWalk.get(h.id);
            if (d > 0.8 && w2 && !w2.wx.length && !w2.leaving)
              this.hiredWalk.set(h.id, { wx: [h.stationX], wz: [h.stationZ], ry: h.stationRy, leaving: false });
          }
        }
      } else if (!h.atWork && h.workState === 'lunch' && h.role === 'cook') {
        // cozinheira fica na copa servindo (não vai embora no almoço)
        const g = this.hiredWorkers.get(h.id);
        const c = this.env.copaCounter;
        if (g && c && Math.hypot(g.position.x - c.x, g.position.z - c.z) > 0.6) {
          const w2 = this.hiredWalk.get(h.id);
          if (!w2 || w2.leaving) this.hiredWalk.set(h.id, { wx: [c.x], wz: [c.z], ry: -Math.PI / 2, leaving: false });
        }
      } else if (!h.atWork && h.workState === 'lunch' && h.role !== 'cook' && this.hasCooks) {
        // almoço na copa: senta numa cadeira (volta ao posto às 13h)
        const chairs = this.env.copaChairs ?? [];
        const ch = chairs.length ? chairs[this.lunchIds.indexOf(h.id) % chairs.length] : null;
        const g = this.hiredWorkers.get(h.id);
        if (g && ch && Math.hypot(g.position.x - ch.x, g.position.z - ch.z) > 0.4) {
          const w2 = this.hiredWalk.get(h.id);
          if (!w2 || w2.leaving || (w2.wx.length && Math.abs((w2.wx[0] ?? ch.x) - ch.x) > 0.01))
            this.hiredWalk.set(h.id, { wx: [ch.x], wz: [ch.z], ry: ch.ry, leaving: false });
        }
      } else {
        // almoço em casa ou fim do expediente: vai embora
        if (w && !w.leaving) {
          const p = this.hiredWorkers.get(h.id)?.position;
          if (p) {
            // caminho de volta pro spawn
            const path = this.makeHiredExitPath(h.role, p.x, p.z);
            this.hiredWalk.set(h.id, { wx: path.wx, wz: path.wz, ry: path.ry, leaving: true });
          }
        }
      }
    });
    for (const [id, g] of this.hiredWorkers)
      if (!seen.has(id)) {
        this.mgrSeat.delete(id);
        this.mgrNext.delete(id);
        this.hiredCalled.delete(id);
        this.hiredNames.delete(id);
        this.hiredWaiting.delete(id);
        const rr = this.reqRings.get(id);
        if (rr) {
          this.scene.remove(rr);
          this.reqRings.delete(id);
        }
        if (this.calledHiredId === id) this.calledHiredId = null;
        if (this.hoverHiredId === id) this.hoverHiredId = null;
        if (this.requestTalkId === id) {
          this.requestTalkId = null;
          this.state.requestTalk = null;
        }
        const w = this.hiredWalk.get(id);
        if (w && !w.leaving) {
          const p = g.position;
          const path = this.makeHiredExitPath('dev', p.x, p.z);
          this.hiredWalk.set(id, { wx: path.wx, wz: path.wz, ry: path.ry, leaving: true });
        } else if (!w) {
          this.hiredGroup.remove(g);
          this.hiredWorkers.delete(id);
          this.hiredWalk.delete(id);
        }
      }
  }
  makeHiredExitPath(role: string, x: number, z: number) {
    if (role === 'recep') {
      // recep sai pela lateral do balcão
      return { wx: [x, 3.4, 3.4, 0, 0], wz: [z, -29.4, -25, -20, 15.6], ry: Math.PI };
    }
    if (role === 'cook') {
      // copa → porta oeste → beco → spawn (só por portas/aberto)
      return { wx: [6, 5, 0, 0], wz: [15.5, 15.5, 15.5, 15.6], ry: Math.PI };
    }
    // dev sai pela porta da sala de devs
    return { wx: [x, 3.2, 1.5, 0, 0], wz: [z, 6.6, 9, 9.5, 15.6], ry: Math.PI };
  }
  updateHired(dt: number) {
    const speed = 1.4;
    const ky = 1 - Math.exp(-dt * 6);
    // anel do chamado segue o NPC (verde = perto, vermelho = longe)
    if (this.followRing) {
      const cg = this.calledHiredId ? this.hiredWorkers.get(this.calledHiredId) : null;
      if (cg) {
        const d = Math.hypot(cg.position.x - this.camera.position.x, cg.position.z - this.camera.position.z);
        this.followRing.visible = this.state.mode === 'playing';
        this.followRing.position.set(cg.position.x, 0.03, cg.position.z);
        (this.followRing.material as THREE.MeshBasicMaterial).color.set(d > 8 ? 0xff4444 : 0x39d353);
      } else {
        this.followRing.visible = false;
      }
    }
    // anéis vermelhos: quem espera resposta no RH (um por NPC, some ao resolver)
    const waitingNow = new Set<string>();
    for (const [id, g] of this.hiredWorkers) {
      if (!this.hiredWaiting.get(id)) continue;
      waitingNow.add(id);
      let ring = this.reqRings.get(id);
      if (!ring) {
        ring = new THREE.Mesh(
          this.followRing?.geometry ?? new THREE.RingGeometry(0.45, 0.62, 24),
          new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        this.reqRings.set(id, ring);
        this.scene.add(ring);
      }
      ring.visible = this.state.mode === 'playing';
      ring.position.set(g.position.x, 0.03, g.position.z);
    }
    for (const [id, ring] of this.reqRings)
      if (!waitingNow.has(id)) {
        this.scene.remove(ring);
        (ring.material as THREE.Material).dispose();
        this.reqRings.delete(id);
      }
    for (const [id, g] of this.hiredWorkers) {
      // chamado: ignora waypoints e segue o jogador (para a 1.3m)
      if (id === this.calledHiredId) {
        const dx = this.camera.position.x - g.position.x;
        const dz = this.camera.position.z - g.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 1.3) {
          const step = Math.min(3.2 * dt, d - 1.3);
          this.npcStep(g, (dx / d) * step, (dz / d) * step);
          g.rotation.y = Math.atan2(dx, dz);
        } else {
          g.rotation.y = Math.atan2(dx, dz);
        }
        g.position.y += (0 - g.position.y) * ky;
        this.poseFig(g, d > 1.35, false);
        const tag = g.userData.tag as THREE.Mesh | undefined;
        if (tag) tag.quaternion.copy(this.camera.quaternion);
        continue;
      }
      const w = this.hiredWalk.get(id);
      if (w && w.wx.length) {
        const dx = w.wx[0] - g.position.x;
        const dz = w.wz[0] - g.position.z;
        const d = Math.hypot(dx, dz);
        const step = speed * dt;
        if (d <= Math.max(step, 0.08)) {
          g.position.x = w.wx[0];
          g.position.z = w.wz[0];
          w.wx.shift();
          w.wz.shift();
          if (!w.wx.length) {
            if (w.leaving) {
              this.hiredGroup.remove(g);
              this.hiredWorkers.delete(id);
              this.hiredWalk.delete(id);
              continue;
            }
            g.rotation.y = w.ry;
          }
        } else {
          this.npcStep(g, (dx / d) * step, (dz / d) * step);
          g.rotation.y = Math.atan2(dx, dz);
        }
      }
      const seated = w && !w.wx.length && !w.leaving;
      g.position.y += ((seated ? -0.15 : 0) - g.position.y) * ky;
      this.poseFig(g, !!w?.wx.length, !!seated);
      const tag = g.userData.tag as THREE.Mesh | undefined;
      if (tag) tag.quaternion.copy(this.camera.quaternion);
    }
  }
  // ponytail: gerente faz ronda visível pela sala de devs (sai da estação 1, visita as fileiras, volta)
  updateManagers() {
    if (!this.devs.size) return;
    for (const [id, seat] of this.mgrSeat) {
      const g = this.hiredWorkers.get(id);
      const w = this.hiredWalk.get(id);
      if (!g || !w || w.wx.length || w.leaving) continue;
      if (this.hiredWaiting.get(id)) continue; // no RH: sem ronda
      if ((this.mgrNext.get(id) ?? 0) > this.elapsed) continue;
      this.mgrNext.set(id, this.elapsed + 150);
      this.hiredWalk.set(id, {
        wx: [5.8, 5.8, 5.8, seat.x], wz: [7.4, 9, 10.6, seat.z], ry: seat.ry, leaving: false,
      });
    }
  }
  // ponytail: técnico de conserto anda do spawn até a máquina (portas abrem no caminho)
  techTarget(where: string) {
    if (where.startsWith('st:')) {
      const st = (this.env.devStations ?? [])[Number(where.slice(3))];
      if (st) return { x: st.x, z: st.z, ry: st.ry };
    } else if (where.startsWith('rm:')) {
      const nb = (this.env.notebooks ?? []).find((n) => n.roomId === where.slice(3));
      if (nb) {
        const x = nb.x - Math.sign(nb.x || 1) * 0.7;
        return { x, z: nb.z, ry: x > 0 ? Math.PI / 2 : -Math.PI / 2 };
      }
    }
    return null;
  }
  techPathTo(tx: number, tz: number) {
    const doors = (this.env.doors ?? []).filter(
      (d) => d.plane === 'x' && Math.sign(d.x) === (tx >= 0 ? 1 : -1) && Math.abs(d.z - tz) < 5,
    );
    const door = doors[0];
    if (!door) return { wx: [tx], wz: [tz] };
    return { wx: [0, 0, door.x, tx], wz: [15.6, door.z, door.z, tz] };
  }
  setCompanyTechs(techs: { id: string; name: string; where: string; state: string }[]) {
    const seen = new Set<string>();
    techs.forEach((t) => {
      const tgt = this.techTarget(t.where);
      if (!tgt) return;
      seen.add(t.id);
      if (!this.techs.has(t.id)) {
        const g = this.makeRemote(t.name, variantForId(t.id));
        g.position.set(0, 0, 15.6);
        g.rotation.y = Math.PI;
        this.techs.set(t.id, g);
        this.techGroup.add(g);
        const path = this.techPathTo(tgt.x, tgt.z);
        this.techWalk.set(t.id, { ...path, ry: tgt.ry, leaving: false });
      }
    });
    for (const [id, g] of this.techs)
      if (!seen.has(id)) {
        // consertou: volta ao spawn e some
        const w = this.techWalk.get(id);
        if (w && !w.leaving) {
          const p = g.position;
          const doors = (this.env.doors ?? []).filter(
            (d) => d.plane === 'x' && Math.sign(d.x) === (p.x >= 0 ? 1 : -1) && Math.abs(d.z - p.z) < 6,
          );
          const door = doors[0];
          const wx = door ? [door.x, 0, 0] : [0];
          const wz = door ? [door.z, door.z, 15.6] : [15.6];
          this.techWalk.set(id, { wx, wz, ry: Math.PI, leaving: true });
        } else if (!w) {
          this.techGroup.remove(g);
          this.techs.delete(id);
        }
      }
  }
  updateTechs(dt: number) {
    const speed = 1.4;
    for (const [id, g] of this.techs) {
      const w = this.techWalk.get(id);
      if (w && w.wx.length) {
        const dx = w.wx[0] - g.position.x;
        const dz = w.wz[0] - g.position.z;
        const d = Math.hypot(dx, dz);
        const step = speed * dt;
        if (d <= Math.max(step, 0.08)) {
          g.position.x = w.wx[0];
          g.position.z = w.wz[0];
          w.wx.shift();
          w.wz.shift();
          if (!w.wx.length) {
            if (w.leaving) {
              this.techGroup.remove(g);
              this.techs.delete(id);
              this.techWalk.delete(id);
              continue;
            }
            g.rotation.y = w.ry;
          }
        } else {
          this.npcStep(g, (dx / d) * step, (dz / d) * step);
          g.rotation.y = Math.atan2(dx, dz);
        }
      }
      this.poseFig(g, !!w?.wx.length, false);
      const tag = g.userData.tag as THREE.Mesh | undefined;
      if (tag) tag.quaternion.copy(this.camera.quaternion);
    }
  }
  // ponytail: estoque — monitores instalados + caixas no spawn + caixa na mão
  setCompanyStock(
    states: ('ok' | 'broken' | 'empty')[],
    pkgs: { id: string; mine: boolean; claimer: string | null; x?: number | null; z?: number | null; label?: string }[],
    carryBoxId: string | null,
  ) {
    this.stockStations = states;
    this.carryBoxId = carryBoxId;
    // minhas caixas: as do carrinho grudam nele; o resto é mão (só 1)
    this.myBoxes = pkgs.filter((p) => p.mine).map((p) => p.id);
    if (carryBoxId && !this.myBoxes.includes(carryBoxId)) this.myBoxes.push(carryBoxId);
    // descarregou/instalou: sai do carrinho sozinho
    this.dollyLoad = this.dollyLoad.filter((id) => this.myBoxes.includes(id));
    // pegou com o carrinho na mão: vai direto p/ cima dele
    if (this.dollyGrabbed) {
      for (const id of this.myBoxes)
        if (!this.dollyLoad.includes(id) && this.dollyLoad.length < 3) this.dollyLoad.push(id);
    }
    this.handBoxId = this.myBoxes.find((id) => !this.dollyLoad.includes(id)) ?? null;
    if (this.carryMesh) {
      this.carryMesh.visible = !!this.handBoxId;
      if (this.handBoxId) {
        const mine = pkgs.find((p) => p.id === this.handBoxId);
        if (mine?.label) this.setBoxLabel(this.carryMesh, mine.label, 0.36);
      }
    }
    // carrinho: mostra quantas vão em cima (até 3), parado ou na mão
    this.dollySlots.forEach((slot, i) => {
      const boxId = this.dollyLoad[i];
      slot.visible = !!this.dolly?.visible && !!boxId;
      if (boxId) {
        const label = this.pkgLabels.get(boxId);
        if (label) this.setBoxLabel(slot, label, 0.3);
        const boxMesh = slot.children[0] as THREE.Mesh;
        if (boxMesh && boxMesh.material) {
          const mat = boxMesh.material as THREE.MeshStandardMaterial;
          if (label?.includes('PREMIUM')) mat.color.set(0xc09030);
          else if (label?.includes('INTER')) mat.color.set(0xa07040);
          else mat.color.set(0x8a6a42);
        }
      }
    });
    this.devMonitors.forEach((m, i) => {
      const state = states[i];
      m.visible = state === 'ok' || state === 'broken';
      const scrMat = m.userData.scrMat as THREE.MeshStandardMaterial | undefined;
      if (scrMat) {
        if (state === 'broken') {
          scrMat.color.set(0xff4444);
          scrMat.emissive.set(0xff4444);
          scrMat.emissiveIntensity = 0.7;
        } else {
          // laptop code texture — ok mostra código, não azul sólido
          scrMat.color.set(0xffffff);
          scrMat.emissive.set(0x0a2a3a);
          scrMat.emissiveIntensity = 0.32;
        }
      }
    });
    const seen = new Set<string>();
    const spots = [
      { x: 2.6, z: 17.2 },
      { x: -2.6, z: 17.2 },
      { x: 0, z: 17.8 },
    ];
    const remoteSeen = new Set<string>();
    pkgs.forEach((p, i) => {
      if (p.claimer && !p.mine) {
        // na mão de outro jogador: pendura a caixa no boneco dele (todos veem)
        remoteSeen.add(p.id);
        const cur = this.remoteCarry.get(p.id);
        let rid: string | null = null;
        for (const [id, name] of this.remoteNames) if (name === p.claimer) rid = id;
        const holder = rid ? this.remotes.get(rid) : null;
        if (holder && (!cur || cur.remoteId !== rid)) {
          this.detachRemoteCarry(p.id);
          const mesh = this.makeCarryBox(0.4);
          mesh.position.set(0, 1.05, 0.35);
          holder.add(mesh);
          this.remoteCarry.set(p.id, { remoteId: rid!, mesh });
        } else if (!holder && cur) {
          this.detachRemoteCarry(p.id);
        }
        return;
      }
      if (p.claimer) return; // minha: só na mão (carryMesh), some do chão
      seen.add(p.id);
      if (p.label) this.pkgLabels.set(p.id, p.label);
      if (!this.pkgs.has(p.id)) {
        const grp = this.makeCarryBox(0.5, p.label);
        const s = p.x != null && p.z != null ? { x: p.x, z: p.z } : spots[i % spots.length];
        grp.position.set(s.x, 0, s.z);
        this.pkgs.set(p.id, grp);
        this.pkgGroup.add(grp);
      } else {
        // largada no chão: atualiza a posição
        const g = this.pkgs.get(p.id)!;
        const s = p.x != null && p.z != null ? { x: p.x, z: p.z } : spots[i % spots.length];
        g.position.set(s.x, 0, s.z);
        if (p.label) this.setBoxLabel(g, p.label, 0.5);
      }
    });
    for (const [id, g] of this.pkgs)
      if (!seen.has(id)) {
        this.pkgGroup.remove(g);
        this.disposeBox(g);
        this.pkgs.delete(id);
        this.pkgLabels.delete(id);
      }
    for (const [id] of this.remoteCarry)
      if (!remoteSeen.has(id)) this.detachRemoteCarry(id);
  }
  makeCarryBox(s: number, label?: string) {
    const grp = new THREE.Group();
    const bx = new THREE.Mesh(
      new THREE.BoxGeometry(s, s * 0.8, s * 0.9),
      new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 }),
    );
    bx.position.y = s * 0.4;
    bx.castShadow = true;
    const tp = new THREE.Mesh(
      new THREE.BoxGeometry(s * 1.02, s * 0.82, s * 0.24),
      new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.9 }),
    );
    tp.position.y = s * 0.4;
    grp.add(bx, tp);
    if (label) this.setBoxLabel(grp, label, s);
    return grp;
  }
  // ponytail: nome do tier colado na caixa (Notebook BÁSICO/PREMIUM…) — 1 sprite por caixa
  setBoxLabel(grp: THREE.Group, text: string, s: number) {
    if (grp.userData.labelText === text) return;
    grp.userData.labelText = text;
    const old = grp.userData.labelSprite as THREE.Mesh | undefined;
    if (old) {
      grp.remove(old);
      old.geometry.dispose();
      ((old.material as THREE.MeshBasicMaterial).map)?.dispose();
      (old.material as THREE.Material).dispose();
    }
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 56;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, 256, 56);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 252, 52);
    ctx.fillStyle = '#ffe9c8';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text.slice(0, 22), 128, 38);
    const tex = new THREE.CanvasTexture(canvas);
    const sp = new THREE.Mesh(
      new THREE.PlaneGeometry(s * 1.1, s * 0.24),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    sp.position.y = s * 0.82 + 0.02;
    grp.add(sp);
    grp.userData.labelSprite = sp;
  }
  // ponytail: caixas são descartáveis (geometria/material exclusivos) — dispose ao sumir
  disposeBox(grp: THREE.Group) {
    grp.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mm) => {
        (mm as THREE.MeshBasicMaterial).map?.dispose();
        mm.dispose();
      });
    });
  }
  detachRemoteCarry(boxId: string) {
    const cur = this.remoteCarry.get(boxId);
    if (!cur) return;
    this.remotes.get(cur.remoteId)?.remove(cur.mesh);
    this.disposeBox(cur.mesh);
    this.remoteCarry.delete(boxId);
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
  setCompanyRoomsPC(map: Record<string, boolean>, brokenIds: string[] = []) {
    this.roomsPC = map;
    for (const r of this.env.roomMonitors ?? []) {
      const on = map[r.roomId];
      const broken = brokenIds.includes(r.roomId);
      r.group.visible = on !== false || broken;
      const scrMat = r.group.userData.scrMat as THREE.MeshStandardMaterial | undefined;
      if (scrMat) {
        if (broken) {
          scrMat.color.set(0xff4444);
          scrMat.emissive.set(0xff4444);
          scrMat.emissiveIntensity = 0.7;
        } else {
          scrMat.color.set(0xffffff);
          scrMat.emissive.set(0x0a2a3a);
          scrMat.emissiveIntensity = 0.32;
        }
      }
    }
  }
  applyPlaque(roomId: string, text: string) {
    if (roomId === 'COPA_TV') {
      this.setTVState(text.trim().toLowerCase() === 'on');
      return;
    }
    this.serverPlaques.add(roomId);
    this.env.plaques.find((p) => p.roomId === roomId)?.setText(text);
  }
  // ponytail: TV da copa — liga/desliga local + avisa p/ persistir (roomState COPA_TV)
  onToggleTV: ((on: boolean) => void) | null = null;
  tvSwitchTarget = false;
  setTVState(on: boolean) {
    this.tvPlaying = on;
    try {
      if (on) void this.tvVideo?.play().catch(() => {});
      else this.tvVideo?.pause();
    } catch { /* sem vídeo: só o estado */ }
    const t = this.tvSwitchGroup?.userData?.toggle as THREE.Mesh | undefined;
    if (t) t.position.y = on ? 0.16 : 0.1;
    this.drawTVScreen();
  }
  toggleTV() {
    const on = !this.tvPlaying;
    this.setTVState(on);
    this.onToggleTV?.(on);
    this.sound.noise(0.05, 0.1, 900);
  }
  enterDesktop() {
    this.state.mode = 'desktop';
    this.state.desktop = true;
    this.desktopRoomId = this.notebookTarget?.roomId ?? null;
    this.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    this.onUse?.(this.desktopRoomId);
    this.emit();
  }
  exitDesktop() {
    if (this.state.mode !== 'desktop') return;
    this.state.mode = 'playing';
    this.state.desktop = false;
    this.desktopRoomId = null;
    this.keys.clear();
    this.onUse?.(null);
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
      desktopRoom: this.desktopRoomId,
      calledHired: this.state.calledHired,
      requestTalk: this.state.requestTalk,
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
    this.updateBots(dt);
    this.updateDevs(dt);
    this.updateReceps(dt);
    this.updateHired(dt);
    this.updateTechs(dt);
    this.updateManagers();
    this.updateTV(dt);
    this.updateCopaVapor(dt);
    this.netClock -= dt;
    if (this.state.mode === 'playing' && this.netClock <= 0) {
      this.netClock = 1 / 15;
      this.onLocalMove?.(
        this.camera.position.x,
        this.camera.position.z,
        this.yaw,
        this.feetY,
        this.crouching,
      );
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
    void moving;
    this.hudClock += dt;
    if (this.hudClock > 0.1) {
      this.hudClock = 0;
      this.state.fps = Math.round(1 / Math.max(dt, 0.001));
      this.emit();
    }
    // ponytail: render direto (renderer já atualiza matrixWorld; sem RT intermediário)
    this.renderer.render(this.scene, this.camera);
    this.reportPerf(frameMs, t1 - t0, 0, 0, performance.now() - t1);
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
