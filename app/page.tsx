'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  ArrowUpRight,
  RotateCcw,
  ChevronRight,
  Settings2,
  X,
  MoveUpRight,
  DoorOpen,
  LogOut,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { Game, Snapshot } from './game/engine';
import type { GraphicsPreset } from './game/graphics';
import { api } from './api';
import { Notepad, Calculator, PlaqueEditor } from './game/desktop';
import { CompanyApp } from './game/company';
import { FIGURE_VARIANTS, type FigureVariantId } from './game/figures';
function Minimap({
  player,
  players,
  company,
}: {
  player: { x: number; z: number };
  players: { x: number; z: number }[];
  company: import('./game/net').CompanyState | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = 180, H = 180;
    c.width = W; c.height = H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a151e';
    ctx.fillRect(0, 0, W, H);
    const mapX = (x: number) => ((x + 24) / 48) * (W - 10) + 5;
    const mapZ = (z: number) => ((18.5 - z) / 60.5) * (H - 10) + 5;
    const rect = (x0: number, z0: number, x1: number, z1: number) => {
      const ax = mapX(Math.min(x0, x1)), bx = mapX(Math.max(x0, x1));
      const ay = mapZ(Math.max(z0, z1)), by = mapZ(Math.min(z0, z1));
      return [ax, ay, bx - ax, by - ay] as const;
    };
    // corridor
    ctx.fillStyle = '#1e2a33';
    const [cx, cy, cw, ch] = rect(-1.5, -31, 1.5, 14.3);
    ctx.fillRect(cx, cy, cw, ch);
    // rooms W1,W2,W3 (-4.25) E1,E2,E3 (+4.25)
    const centers = [9, -4, -17];
    const ids = ['W1', 'W2', 'W3', 'E1', 'E2', 'E3'];
    ids.forEach((id, i) => {
      const side = i < 3 ? -1 : 1;
      const ci = i % 3;
      const cx0 = side * 7, w = 5.5, h = 7;
      const x0 = side === -1 ? -7 : 1.5, x1 = side === -1 ? -1.5 : 7;
      const z0 = centers[ci] - 3.5, z1 = centers[ci] + 3.5;
      const locked = company ? !company.ownedRooms.includes(id) : false;
      ctx.fillStyle = locked ? '#402020' : '#2a3a2a';
      ctx.fillRect(...rect(x0, z0, x1, z1));
      ctx.strokeStyle = locked ? '#6b2a2a' : '#3a5a3a';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(...rect(x0, z0, x1, z1));
      ctx.fillStyle = '#9fb3ac';
      ctx.font = '7px monospace';
      ctx.fillText(id, mapX((x0 + x1) / 2) - 8, mapZ(centers[ci]) + 2);
    });
    // copa
    ctx.fillStyle = '#3d2a18';
    ctx.fillRect(...rect(6, 13.5, 16, 18.5));
    ctx.fillStyle = '#9fb3ac';
    ctx.font = '6px monospace';
    ctx.fillText('COPA', mapX(11) - 10, mapZ(16) + 2);
    // spawn
    ctx.fillStyle = '#1a2a3a';
    ctx.fillRect(...rect(-4, 14.3, 4, 18.7));
    // recepção
    ctx.fillStyle = '#2a1e2a';
    ctx.fillRect(...rect(-5, -30.5, 5, -23.5));
    ctx.fillStyle = '#9fb3ac';
    ctx.font = '6px monospace';
    ctx.fillText('REC', mapX(0) - 8, mapZ(-27) + 2);
    // other players
    players.forEach((p) => {
      ctx.fillStyle = '#4da3ff';
      ctx.beginPath();
      ctx.arc(mapX(p.x), mapZ(p.z), 3, 0, Math.PI * 2);
      ctx.fill();
    });
    // self
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(mapX(player.x), mapZ(player.z), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [player, players, company]);
  return (
    <div className="minimap" aria-label="Minimapa">
      <canvas ref={ref} width={180} height={180} />
      <span className="minimap-title">MAPA</span>
    </div>
  );
}

import {
  XPWindow,
  useWindows,
  XP_TITLES,
  DesktopIcon,
  type DesktopFile,
  type Win,
} from './game/xp';

const initial: Snapshot = {
  mode: 'menu',
  fps: 60,
  player: { x: 0, z: 13 },
  prompt: '',
  desktop: false,
  desktopRoom: null,
  calledHired: null,
  requestTalk: null,
};

// etiqueta da caixa ao mirar e no mesh 3D: tier do notebook ou PC usado (de onde veio)
const TIER_PT: Record<string, string> = { basico: 'BÁSICO', inter: 'INTER', premium: 'PREMIUM' };
function boxLabel(boxId: string, machines: { id: string; from: string | null }[], tier?: string) {
  const m = machines.find((x) => x.id === boxId);
  if (!m) return `📦 NOTEBOOK ${TIER_PT[tier ?? 'basico'] ?? 'BÁSICO'}`;
  return `💻 PC USADO${m.from ? ` (EX ${m.from.toUpperCase()})` : ''}`;
}

// salas com máquina quebrada (monitor fica vermelho em vez de sumir)
function brokenRooms(machines: { where: string; broken: boolean }[]) {
  return machines.filter((m) => m.broken && m.where.startsWith('rm:')).map((m) => m.where.slice(3));
}

export default function Home() {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<Game | null>(null);
  const [state, setState] = useState(initial),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [settings, setSettings] = useState(false),
    [muted, setMuted] = useState(false),
    [sensitivity, setSensitivity] = useState(1),
    [graphics, setGraphics] = useState<GraphicsPreset>('low'),
    [startOpen, setStartOpen] = useState(false),
    [clock, setClock] = useState(''),
    [fullscreen, setFullscreen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [character, setCharacter] = useState<FigureVariantId>('azul');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [session, setSession] = useState<{ token: string; username: string } | null>(
    () => {
      const token = api.token();
      const name = api.username();
      return token && name ? { token, username: name } : null;
    },
  );
  const net = useRef<import('./game/net').Net | null>(null);
  const [netInst, setNetInst] = useState<import('./game/net').Net | null>(null);
  const selfId = useRef('');
  const [players, setPlayers] = useState<import('./game/net').NetPlayer[]>([]);
  const [netOnline, setNetOnline] = useState(false);
  const [backend, setBackend] = useState<'checking' | 'online' | 'offline'>('checking');
  const backendOn = backend === 'online';
  const connected = backendOn && netOnline;
  const [welcome, setWelcome] = useState<import('./game/net').Welcome | null>(null);
  // ponytail: lobby de salas privadas — sem sala escolhida, sem conexão
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomsList, setRoomsList] = useState<{ owned: { code: string; name: string; live: boolean }[]; recent: { code: string; name: string; live: boolean }[] } | null>(null);
  const [roomsError, setRoomsError] = useState('');
  const [joining, setJoining] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [plaquesText, setPlaquesText] = useState<Record<string, string>>({});
  const { windows, open, close, minimize, toggleMax, focus, move, hydrate } = useWindows();
  const [desktopFiles, setDesktopFiles] = useState<DesktopFile[]>([]);
  const [filesTick, setFilesTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const lastNotif = useRef<string | null>(null);
  const toastTimer = useRef(0);
  const [company, setCompany] = useState<import('./game/net').CompanyState | null>(null);
  const [notice, setNotice] = useState('');
  const hydratedFor = useRef<string | null>(null);
  const applyPlayers = useCallback(
    (list: import('./game/net').NetPlayer[]) => {
      const others = list.filter((p) => p.id !== selfId.current);
      setPlayers(others);
      engine.current?.setRemotePlayers(others);
    },
    [],
  );
  useEffect(() => {
    let disposed = false;
    void import('./game/engine')
      .then(({ Game }) => {
        if (disposed || !host.current) return;
        try {
          engine.current = new Game(host.current, setState);
          setReady(true);
        } catch (e) {
          setError(
            e instanceof Error ? e.message : 'Unable to initialize graphics.',
          );
        }
      })
      .catch((e) => {
        if (!disposed)
          setError(
            e instanceof Error ? e.message : 'Unable to initialize graphics.',
          );
      });
    return () => {
      disposed = true;
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  // lista as salas ao logar (lobby); entrar numa sala conecta o WS com ?room=
  useEffect(() => {
    if (!session || roomCode) return;
    let alive = true;
    setRoomsError('');
    api.rooms().then((r) => {
      if (alive) setRoomsList(r);
    }).catch((e) => {
      if (alive) setRoomsError(e instanceof Error ? e.message : 'erro ao listar salas');
    });
    return () => {
      alive = false;
    };
  }, [session, roomCode]);
  const enterRoom = useCallback(
    async (code: string, name?: string) => {
      const clean = code.trim().toUpperCase();
      if (!clean) return;
      setRoomsError('');
      setJoining(true);
      try {
        const found = name ? { code: clean, name } : await api.joinRoom(clean);
        setWelcome(null);
        setCompany(null);
        setPlayers([]);
        setRoomCode(found.code);
      } catch (e) {
        setRoomsError(e instanceof Error ? e.message : 'sala não encontrada');
        setJoining(false);
      }
    },
    [],
  );
  const createRoom = useCallback(async () => {
    setRoomsError('');
    setJoining(true);
    try {
      const r = await api.createRoom(newRoomName.trim() || 'Sala');
      setWelcome(null);
      setCompany(null);
      setPlayers([]);
      setRoomCode(r.code);
      setNewRoomName('');
    } catch (e) {
      setRoomsError(e instanceof Error ? e.message : 'erro ao criar sala');
      setJoining(false);
    }
  }, [newRoomName]);
  const leaveRoom = useCallback(() => {
    net.current?.close();
    net.current = null;
    setNetInst(null);
    setWelcome(null);
    setCompany(null);
    setPlayers([]);
    setRoomCode(null);
    setJoining(false);
    engine.current?.pause();
  }, []);
  const signOut = useCallback(() => {
    leaveRoom();
    api.logout();
    setSession(null);
    setSettings(false);
    setUsername('');
    setPassword('');
    setAuthMode('login');
    setAuthError('');
  }, [leaveRoom]);
  useEffect(() => {
    if (!session || !roomCode) return;
    let disposed = false;
    void import('./game/net').then(({ Net }) => {
      if (disposed) return;
      const n = new Net();
      net.current = n;
      setNetInst(n);
      n.onStatus = (online) => setNetOnline(online);
      n.onPlayers = applyPlayers;
      n.onWelcome = (w) => {
        selfId.current = w.id;
        if (engine.current) engine.current.localId = w.id;
        setWelcome(w);
        setJoining(false);
        setPlaquesText(w.plaques);
        if (w.company) {
          setCompany(w.company);
          engine.current?.setCompanyBots(w.company.queue, w.company.attending, w.company.serving);
          engine.current?.setCompanyRoomsPC(w.company.roomsPC, brokenRooms(w.company.machines));
          engine.current?.setCompanyDevs(
            w.company.hired.filter((h) => h.role === 'dev').map((h) => ({ id: h.id, name: h.name })),
          );
          engine.current?.setCompanyReceps(
            w.company.hired
              .filter((h) => h.role === 'recep' && h.post !== null)
              .map((h) => ({ id: h.id, name: h.name, post: h.post ?? 0 })),
          );
          engine.current?.setCompanyHired(w.company.hired);
          engine.current?.setCompanyTechs(w.company.techs ?? []);
          engine.current?.setRhRoom(w.company.rhRoom ?? null);
          engine.current?.setDollyOwned(w.company.dollyOwned ?? false);
          if (w.company.dollyPos) engine.current?.setDollyPos(w.company.dollyPos.x, w.company.dollyPos.z);
          engine.current?.setLockedRooms(['W1', 'W2', 'W3', 'E1', 'E2', 'E3'].filter((r) => !(w.company?.ownedRooms ?? []).includes(r)));
          engine.current?.setCompanyStock(w.company.stations, [], null);
        }
        applyPlayers(w.players);
        for (const [roomId, text] of Object.entries(w.plaques))
          engine.current?.applyPlaque(roomId, text);
        for (const [roomId, on] of Object.entries(w.lights))
          engine.current?.applyLight(roomId, on);
      };
      n.onPlaque = (roomId, text) => {
        setPlaquesText((prev) => ({ ...prev, [roomId]: text }));
        engine.current?.applyPlaque(roomId, text);
      };
      n.onCompany = (c) => {
        setCompany(c);
        engine.current?.setCompanyBots(c.queue, c.attending, c.serving);
        engine.current?.setCompanyRoomsPC(c.roomsPC, brokenRooms(c.machines));
        engine.current?.setCompanyDevs(
          c.hired.filter((h) => h.role === 'dev').map((h) => ({ id: h.id, name: h.name })),
        );
        engine.current?.setCompanyReceps(
          c.hired
            .filter((h) => h.role === 'recep' && h.post !== null)
            .map((h) => ({ id: h.id, name: h.name, post: h.post ?? 0 })),
        );
        engine.current?.setCompanyHired(c.hired);
        engine.current?.setCompanyTechs(c.techs ?? []);
        engine.current?.setRhRoom(c.rhRoom ?? null);
        engine.current?.setDollyOwned(c.dollyOwned ?? false);
        if (c.dollyPos) engine.current?.setDollyPos(c.dollyPos.x, c.dollyPos.z);
        engine.current?.setLockedRooms(['W1', 'W2', 'W3', 'E1', 'E2', 'E3'].filter((r) => !c.ownedRooms.includes(r)));
        const me = session?.username ?? '';
        const myBox = c.packages.find((p) => p.claimer === me)?.id ?? null;
        engine.current?.setCompanyStock(
          c.stations,
          c.packages.map((p) => ({
            id: p.id,
            mine: p.claimer === me,
            claimer: p.claimer,
            x: p.x,
            z: p.z,
            label: boxLabel(p.id, c.machines, p.tier),
          })),
          myBox,
        );
      };
      n.onCompanyError = (error) => setNotice(error);
      n.onLight = (roomId, on) => engine.current?.applyLight(roomId, on);
      n.onUsing = (_roomId, ok) => {
        if (!ok) {
          setNotice('Esse computador já está em uso');
          engine.current?.exitDesktop();
        }
      };
      n.onFiles = () => setFilesTick((t) => t + 1);
      n.connect(session.token, roomCode);
      if (engine.current) {
        engine.current.onLocalMove = (x, z, yaw, y, crouch) => n.move(x, z, yaw, y, crouch ?? false);
        engine.current.onToggleLight = (roomId, on) => n.light(roomId, on);
        engine.current.onCallNext = () => n.callNext();
        engine.current.onBotClick = (botId) => n.attend(botId);
        engine.current.onCallEmployee = (freelancerId) => n.callEmployee(freelancerId);
        engine.current.onReleaseEmployee = (freelancerId) => n.releaseEmployee(freelancerId);
        engine.current.onFireEmployee = (freelancerId) => {
          const name = engine.current?.hiredNames.get(freelancerId) ?? 'funcionário';
          if (window.confirm(`Demitir ${name}? O acerto vira dívida.`)) n.fire(freelancerId);
        };
        engine.current.onPickupBox = (boxId) => n.claimBox(boxId);
        engine.current.onDropBox = (boxId, x, z) => n.dropBox(boxId, x, z);
        engine.current.onNotice = (msg) => setNotice(msg);
        engine.current.onPlaceBox = (boxId, station, room) => n.placeBox(boxId, station, room);
        engine.current.onToggleTV = (on) => n.plaque('COPA_TV', on ? 'on' : 'off');
        engine.current.onDollyPos = (x, z) => n.dollyPos(x, z);
        engine.current.onUse = (roomId) => n.using(roomId);
      }
    });
    return () => {
      disposed = true;
      net.current?.close();
      net.current = null;
      setNetInst(null);
    };
  }, [session, ready, roomCode, applyPlayers]);
  useEffect(() => {
    engine.current?.configure({ muted, sensitivity, graphics });
  }, [muted, sensitivity, graphics, ready]);
  useEffect(() => {
    const f = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  useEffect(() => {
    if (!state.desktop || !state.desktopRoom) return;
    let active = true;
    api
      .authed<{ files: DesktopFile[] }>(`/files?computer=${state.desktopRoom}`)
      .then(({ files }) => {
        if (active)
          setDesktopFiles(
            files.map((f) => ({ id: f.id, name: f.name, posX: f.posX, posY: f.posY })),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [state.desktop, state.desktopRoom, filesTick]);
  useEffect(() => {
    const room = state.desktopRoom;
    if (!state.desktop || !room) {
      hydratedFor.current = null;
      return;
    }
    let active = true;
    api
      .authed<{ state: { windows?: Win[] } }>(`/computers/${room}/state`)
      .then(({ state: s }) => {
        if (active && Array.isArray(s?.windows)) hydrate(s.windows);
      })
      .catch(() => {})
      .finally(() => {
        if (active) hydratedFor.current = room;
      });
    return () => {
      active = false;
    };
  }, [state.desktop, state.desktopRoom, hydrate]);
  useEffect(() => {
    const room = state.desktopRoom;
    if (!state.desktop || !room || hydratedFor.current !== room) return;
    const t = window.setTimeout(() => {
      void api
        .authed(`/computers/${room}/state`, {
          method: 'PUT',
          body: JSON.stringify({ state: { windows } }),
        })
        .catch(() => {});
    }, 500);
    return () => window.clearTimeout(t);
  }, [windows, state.desktop, state.desktopRoom]);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 2500);
    return () => window.clearTimeout(t);
  }, [notice]);
  const moveIcon = (id: string, x: number, y: number) => {
    setDesktopFiles((fs) =>
      fs.map((f) => (f.id === id ? { ...f, posX: x, posY: y } : f)),
    );
    void api
      .authed(`/files/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ posX: x, posY: y }),
      })
      .catch(() => {});
  };
  useEffect(() => {
    if (!state.desktop) return;
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    tick();
    const id = window.setInterval(tick, 10000);
    return () => window.clearInterval(id);
  }, [state.desktop]);
  const active = state.mode === 'playing';
  // ponytail: sem backend, sem jogo — health poll + trava no menu e no meio da partida
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const ok = await api.health();
      if (alive) setBackend(ok ? 'online' : 'offline');
    };
    void check();
    const id = window.setInterval(check, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  useEffect(() => {
    if (session && active && !connected) engine.current?.pause();
  }, [session, active, connected]);
  const chatting =
    !!company?.attending &&
    active &&
    !state.desktop &&
    Math.abs(state.player.x) < 3.2 &&
    Math.abs(state.player.z - -27.7) < 3; // só quem está no balcão (espelha atReception do server)
  useEffect(() => {
    if (engine.current) engine.current.chatOpen = chatting;
  }, [chatting]);
  // ponytail: toast para todo logado na notificação mais nova
  useEffect(() => {
    const n0 = company?.notifs[0];
    if (!n0 || n0.id === lastNotif.current) return;
    lastNotif.current = n0.id;
    setToast(`${n0.when} — ${n0.text}`);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, [company]);

  // ponytail: letras A/B/C respondem o chat (sem repeat p/ não disparar andando)
  // só no balcão: longe da recepção o atendimento é de outro jogador/recepcionista
  useEffect(() => {
    const chat = company?.attending?.chat;
    if (!active || state.desktop || !chat) return;
    if (Math.abs(state.player.x) >= 3.2 || Math.abs(state.player.z - -27.7) >= 3) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.repeat || !/^Key[A-Z]$/.test(e.code)) return;
      const opt = chat.opts[e.code.charCodeAt(3) - 65];
      if (!opt || !company?.attending) return;
      const id = company.attending.id;
      if (opt.id === 'yes') net.current?.answer(id, true);
      else if (opt.id === 'hold') net.current?.hold(id);
      else net.current?.answer(id, false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [company, active, state.desktop, state.player.x, state.player.z]);
  // ponytail: teclado no diálogo de RH (aumento/demissão) — Enter aceita, Esc fecha, Backspace recusa
  useEffect(() => {
    if (!active || state.desktop || !state.requestTalk) return;
    // libera o mouse enquanto o diálogo está aberto
    if (document.pointerLockElement) document.exitPointerLock();
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const req = company?.requests.find((r) => r.freelancerId === state.requestTalk!.id);
      if (!req) return;
      if (e.code === 'Enter') {
        e.preventDefault();
        net.current?.raise(req.id, true);
      } else if (e.code === 'Escape') {
        e.preventDefault();
        engine.current?.closeRequestTalk();
      } else if (e.code === 'Backspace') {
        e.preventDefault();
        net.current?.raise(req.id, false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, state.desktop, state.requestTalk, company, net, engine]);
  const start = () => {
    if (!connected) return;
    setSettings(false);
    const s = welcome?.spawn;
    if (s && state.mode !== 'paused')
      engine.current?.spawnAt(s.x, s.z, s.yaw);
    engine.current?.start();
  };
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };
  return (
    <main
      className={`game-root ${active ? 'is-playing' : ''}`}
    >
      <div
        className="scene"
        ref={host}
        aria-label="Three-dimensional office walkthrough"
      />
      <div className="film-grain" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      {!session && (
        <section className="login-panel" data-testid="login">
          <h1>{authMode === 'login' ? 'ENTRAR' : 'CRIAR CONTA'}</h1>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!backendOn) {
                setAuthError('Servidor offline — aguarde conectar');
                return;
              }
              setAuthBusy(true);
              setAuthError('');
              try {
                const { token, username: name } = await api.auth(
                  authMode,
                  username,
                  password,
                  authMode === 'register' ? character : undefined,
                );
                setSession({ token, username: name });
              } catch (err) {
                setAuthError(err instanceof Error ? err.message : 'falha no login');
              } finally {
                setAuthBusy(false);
              }
            }}
          >
            <label>
              Usuário
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                minLength={3}
                maxLength={24}
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={4}
              />
            </label>
            {authMode === 'register' && (
              <fieldset className="char-pick">
                <legend>Personagem</legend>
                {FIGURE_VARIANTS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={character === v.id ? 'char-card selected' : 'char-card'}
                    aria-pressed={character === v.id}
                    onClick={() => setCharacter(v.id)}
                  >
                    <span
                      className="char-swatch"
                      style={{ background: `#${v.shirt.toString(16).padStart(6, '0')}` }}
                      aria-hidden="true"
                    />
                    {v.name}
                  </button>
                ))}
              </fieldset>
            )}
            {authError && <p className="login-error">{authError}</p>}
            {!backendOn && (
              <p className="login-error">
                {backend === 'checking' ? 'Verificando servidor…' : 'Servidor offline — suba o backend (npm run server)'}
              </p>
            )}
            <button className="deploy-button" disabled={authBusy || !backendOn}>
              {authBusy ? 'CONECTANDO…' : authMode === 'login' ? 'ENTRAR' : 'CRIAR CONTA'}
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
            >
              {authMode === 'login' ? 'Criar conta' : 'Já tenho conta'}
            </button>
          </form>
        </section>
      )}
      {active && <div className="reticle" aria-hidden="true" />}
      {session && (active || state.desktop) && !connected && (
        <section className="mission-menu" data-testid="offline-block">
          <div className="mission-kicker">
            <span /> CONEXÃO PERDIDA
          </div>
          <h1>
            SERVIDOR
            <br />
            <em>DESCONECTADO.</em>
          </h1>
          <p className="mission-description">
            O jogo pausou porque o backend caiu. Suba com `npm run server` — reconecta sozinho.
          </p>
        </section>
      )}
      {active && (notice || state.prompt) && (
        <output className="interact-toast">{notice || state.prompt}</output>
      )}
      {active &&
        !state.desktop &&
        company?.attending?.chat &&
        Math.abs(state.player.x) < 3.2 &&
        Math.abs(state.player.z - -27.7) < 3 && (
        <section className="botchat" key={company.attending.id} aria-label="Conversa com cliente">
          <p className="botchat-say">
            <b>
              S{company.attending.ticket} {company.attending.name}:
            </b>{' '}
            “{company.attending.chat.say}”
          </p>
          <small className="botchat-sub">{company.attending.chat.sub}</small>
          <small className="botchat-sub">tecle A/B/C ou clique · movimento pausado</small>
          <div className="botchat-opts">
            {company.attending.chat.opts.map((o, i) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  const id = company.attending!.id;
                  if (o.id === 'yes') net.current?.answer(id, true);
                  else if (o.id === 'hold') net.current?.hold(id);
                  else net.current?.answer(id, false);
                }}
              >
                <kbd className="botchat-key">{String.fromCharCode(65 + i)}</kbd> {o.label}
              </button>
            ))}
          </div>
          <form
            className="botchat-talk"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const v = fd.get('say');
              const text = typeof v === 'string' ? v.trim() : '';
              if (text && company.attending) net.current?.talk(company.attending.id, text);
              e.currentTarget.reset();
            }}
          >
            <input name="say" maxLength={140} placeholder="Falar com o cliente… (cuidado com grosso 😡)" aria-label="Falar com o cliente" />
            <button type="submit">➤</button>
          </form>
        </section>
      )}
      {active && state.requestTalk && (() => {
        const req = company?.requests.find((r) => r.freelancerId === state.requestTalk!.id);
        if (!req) return null;
        const isRaise = req.type !== 'resign';
        return (
          <section className="botchat" key={req.id} aria-label="Conversa no RH">
            <p className="botchat-say">
              <b>🏢 {state.requestTalk!.name}:</b>{' '}
              “{isRaise ? 'Chefe, preciso falar do meu salário…' : 'Chefe, vou pedir minhas contas…'}”
            </p>
            <small className="botchat-sub">
              {isRaise
                ? `Quer aumento para ${req.toLevel ?? '?'} (${req.newSalary != null ? `R$${req.newSalary.toLocaleString('pt-BR')}/mês` : '?'}) — negar pode fazer ele pedir demissão`
                : `Acerto: ${req.total != null ? `R$${req.total.toLocaleString('pt-BR')}` : '?'} — aceitar paga e ele sai`}
            </small>
            <div className="botchat-opts">
              <button type="button" onClick={() => net.current?.raise(req.id, true)}>
                <kbd className="botchat-key">✓</kbd> Aceitar
              </button>
              <button type="button" onClick={() => net.current?.raise(req.id, false)}>
                <kbd className="botchat-key">✕</kbd> Recusar
              </button>
              <button type="button" aria-label="Fechar conversa" onClick={() => engine.current?.closeRequestTalk()}>
                <kbd className="botchat-key">⎋</kbd> Depois
              </button>
            </div>
          </section>
        );
      })()}
      {state.desktop && notice && (
        <output className="interact-toast" style={{ zIndex: 60 }}>
          {notice}
        </output>
      )}
      {active && (
        <div className="hud-players" data-testid="hud-players">
          <span className="hud-dot" /> {players.length} NA SALA
          <ul>
            {players.map((p) => (
              <li key={p.id}>
                {p.using ? '💻 ' : ''}
                {p.username}
              </li>
            ))}
          </ul>
          {!netOnline && <em>reconectando…</em>}
        </div>
      )}
      {active && (
        <div className="hud-fps" data-testid="hud-fps">
          {state.fps} FPS
        </div>
      )}
      {active && company?.packages.some((p) => p.claimer === session?.username) && (
        <div className="hud-carry">📦 levando caixa — vá à sala de devs (E1)</div>
      )}
      {active && state.calledHired && (
        <div className="hud-carry" style={{ top: 270, borderColor: '#39d353' }}>
          📣 {state.calledHired.name} está com você:{' '}
          <button
            type="button"
            onClick={() => net.current?.releaseEmployee(state.calledHired!.id)}
          >
            Liberar
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              const h = state.calledHired!;
              if (window.confirm(`Demitir ${h.name}? O acerto vira dívida.`)) net.current?.fire(h.id);
            }}
          >
            Demitir
          </button>
        </div>
      )}
      {active && company && (
        <div className="hud-company" data-testid="hud-company">
          D{company.day} {company.clock} · R${company.balance.toLocaleString('pt-BR')}
          {company.serving ? ` · SENHA ${company.serving}` : ''} · {company.queue.length} NA FILA
          {company.paused ? ' · ⏸' : ''}
        </div>
      )}
      {toast && <output className="phone-toast">{toast}</output>}
      {active && !state.desktop && <Minimap player={state.player} players={players} company={company} />}
      {state.desktop && (
        <dialog className="xp" open aria-label="Área de trabalho">
          <div className="xp-icons">
            <button type="button" onClick={() => open('company')}>
              <span aria-hidden="true">🏢</span>Empresa {company ? `R${Math.round(company.balance / 1000)}k` : ''}
            </button>
            <button type="button" onClick={() => open('notepad')}>
              <span aria-hidden="true">📝</span>Bloco de notas
            </button>
            <button type="button" onClick={() => open('calc')}>
              <span aria-hidden="true">🧮</span>Calculadora
            </button>
            <button type="button" onClick={() => open('plaque')}>
              <span aria-hidden="true">🪧</span>Placa da sala
            </button>
          </div>
          <div className="xp-desktop-files">
            {desktopFiles.map((f, i) => (
              <DesktopIcon
                key={f.id}
                file={f}
                index={i}
                onOpen={() => open('notepad', f.id)}
                onMove={moveIcon}
              />
            ))}
          </div>
          {windows.map((w) => (
            <XPWindow
              key={w.id}
              win={w}
              title={XP_TITLES[w.app]}
              onFocus={focus}
              onClose={close}
              onMinimize={minimize}
              onToggleMax={toggleMax}
              onMove={move}
            >
              {w.app === 'notepad' && state.desktopRoom && (
                <Notepad
                  key={w.id}
                  computerId={state.desktopRoom}
                  initialFileId={w.arg}
                  refreshKey={filesTick}
                  onChanged={() => setFilesTick((t) => t + 1)}
                  onCreated={() => {
                    close(w.id);
                    setFilesTick((t) => t + 1);
                  }}
                />
              )}
              {w.app === 'calc' && <Calculator />}
              {w.app === 'company' && (
                <CompanyApp
                  company={company}
                  net={netInst}
                  computerId={state.desktopRoom}
                  username={session?.username ?? 'dono'}
                />
              )}
              {w.app === 'plaque' && state.desktopRoom && (
                <PlaqueEditor
                  key={state.desktopRoom}
                  roomId={state.desktopRoom}
                  initial={plaquesText[state.desktopRoom] ?? ''}
                  onSave={(text) => net.current?.plaque(state.desktopRoom!, text)}
                />
              )}
            </XPWindow>
          ))}
          <div className="xp-taskbar">
            <button
              type="button"
              className="xp-start"
              onClick={() => setStartOpen(!startOpen)}
            >
              iniciar
            </button>
            {startOpen && (
              <div className="xp-menu">
                <button
                  type="button"
                  onClick={() => {
                    setStartOpen(false);
                    engine.current?.exitDesktop();
                  }}
                >
                  Encerrar sessão
                </button>
              </div>
            )}
            <div className="xp-tasks">
              {windows.map((w) => (
                <button
                  type="button"
                  key={w.id}
                  className={w.minimized ? 'xp-task minimized' : 'xp-task'}
                  onClick={() => focus(w.id)}
                >
                  {XP_TITLES[w.app]}
                </button>
              ))}
            </div>
            <div className="xp-clock" title={company ? 'Hora do jogo' : 'Hora real (offline)'}>
              {company ? `D${company.day} · ${company.clock}` : clock}
            </div>
          </div>
          <div className="xp-hint">ESC para voltar ao jogo</div>
        </dialog>
      )}
      <header className="topbar">
        <div className="wordmark">
          <span className="brand-mark">
            M<span>\</span>
          </span>
          <span>
            MERIDIAN<span className="wordmark-sub">CORPORATE OFFICES</span>
          </span>
        </div>
        <div className="top-middle">
          <span className="live-dot" />
          {active ? 'ESCRITÓRIO ABERTO' : 'SETOR CENTRAL'}
        </div>
        <div className="tools">
          <button
            title={muted ? 'Enable sound' : 'Mute sound'}
            aria-label={muted ? 'Enable sound' : 'Mute sound'}
            onClick={() => setMuted(!muted)}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <button
            title="Display settings"
            aria-label="Display settings"
            onClick={() => {
              engine.current?.pause();
              setSettings(!settings);
            }}
          >
            <Settings2 size={17} />
          </button>
          <button
            title="Toggle full screen"
            aria-label="Toggle full screen"
            onClick={toggleFull}
          >
            {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
          </button>
        </div>
      </header>
      {session && !active && <div className="menu-shade" />}
      {session && !roomCode && (
        <section className="mission-menu" data-testid="lobby">
          <div className="mission-kicker">
            <span /> SALAS PRIVADAS
          </div>
          <h1>
            ESCOLHA
            <br />
            <em>SUA SALA.</em>
          </h1>
          <p className="mission-description">
            Cada sala tem sua empresa, seu progresso e seu código de convite.
            Saia por 5min e a sala hiberna sozinha.
          </p>
          {roomsError && <p className="error-message">{roomsError}</p>}
          {roomsList && (roomsList.owned.length > 0 || roomsList.recent.length > 0) ? (
            <ul className="lobby-list">
              {[...roomsList.owned.map((r) => ({ ...r, mine: true })), ...roomsList.recent.map((r) => ({ ...r, mine: false }))].map((r) => (
                <li key={r.code}>
                  <button type="button" className="lobby-room" onClick={() => enterRoom(r.code, r.name)} disabled={joining}>
                    <b>{r.name}</b> <code>{r.code}</code>
                    <small>{r.mine ? 'sua sala' : 'convidado'} · {r.live ? '🟢 ativa' : '💤 hibernada'}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mission-description">Nenhuma sala ainda — crie a primeira abaixo.</p>
          )}
          <form
            className="lobby-create"
            onSubmit={(e) => {
              e.preventDefault();
              void createRoom();
            }}
          >
            <input
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="Nome da sala"
              maxLength={24}
              aria-label="Nome da nova sala"
            />
            <button type="submit" className="deploy-button" disabled={joining}>
              + CRIAR SALA
            </button>
          </form>
          <form
            className="lobby-create"
            onSubmit={(e) => {
              e.preventDefault();
              void enterRoom(joinCode);
            }}
          >
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="CÓDIGO do convite"
              maxLength={12}
              aria-label="Código da sala"
            />
            <button type="submit" className="deploy-button" disabled={joining || !joinCode.trim()}>
              ENTRAR →
            </button>
          </form>
          {joining && <p className="mission-description">Conectando…</p>}
        </section>
      )}
      {session && roomCode && joining && !welcome && (
        <section className="mission-menu" data-testid="room-loading">
          <div className="mission-kicker">
            <span /> CARREGANDO
          </div>
          <h1>
            ENTRANDO
            <br />
            <em>NA SALA…</em>
          </h1>
          <p className="mission-description">
            {netOnline ? 'Sincronizando empresa, NPCs e posições…' : 'Conectando ao servidor…'}
          </p>
          <div className="xp-taskbar" aria-hidden="true">
            <div className="xp-tasks">
              <span className="xp-task">{netOnline ? 'carregando mundo…' : 'conectando…'}</span>
            </div>
          </div>
        </section>
      )}
      {session && roomCode && !active && !settings && !state.desktop && welcome && (
        <section className="mission-menu">
          <div className="mission-kicker">
            <span /> {state.mode === 'paused' ? 'VISITA PAUSADA' : 'WALKTHROUGH · EXPLORAÇÃO'}
          </div>
          <h1>
            {state.mode === 'paused' ? (
              <>
                VISITA
                <br />
                <em>PAUSADA.</em>
              </>
            ) : (
              <>
                ESCRITÓRIO
                <br />
                <em>CENTRAL</em>
                <span className="title-period">.</span>
              </>
            )}
          </h1>
          <div className="mission-location">
            <span>04</span>
            <div>
              MERIDIAN CORPORATE TOWER
              <small>SETOR CENTRAL &nbsp; / &nbsp; 6 SALAS</small>
            </div>
          </div>
          <p className="mission-description">
            Caminhe pelo corredor central e visite os seis setores. Cada sala
            tem um colega de trabalho parado.
          </p>
          <button
            className="deploy-button"
            onClick={start}
            disabled={!ready || !!error || !connected}
          >
            {!connected
              ? backend === 'checking'
                ? 'VERIFICANDO SERVIDOR…'
                : 'SERVIDOR OFFLINE'
              : state.mode === 'paused'
                ? 'CONTINUAR VISITA'
                : ready
                  ? 'ENTRAR NO ESCRITÓRIO'
                  : 'INICIALIZANDO'}
            <ArrowUpRight size={22} />
          </button>
          {session && !connected && (
            <p className="error-message">
              Sem conexão com o backend o jogo não roda.
              <small>Suba com `npm run server` (porta 3001) e aguarde reconectar.</small>
            </p>
          )}
          {state.mode === 'paused' && (
            <button
              className="restart-button"
              onClick={() => engine.current?.restart()}
            >
              <RotateCcw size={14} /> RECOMEÇAR
            </button>
          )}
          {welcome && (
            <p className="mission-description">
              Sala <b>{welcome.roomName ?? 'Sala'}</b> · código <code>{welcome.roomCode ?? roomCode}</code>{' '}
              <button type="button" className="link-button" onClick={leaveRoom}>
                trocar de sala
              </button>
            </p>
          )}
          {error && (
            <p className="error-message">
              Graphics could not start. Try a desktop browser with WebGL
              enabled.<small>{error}</small>
            </p>
          )}
        </section>
      )}
      {settings && (
        <section className="settings-panel">
          <button
            className="settings-close"
            aria-label="Close settings"
            onClick={() => setSettings(false)}
          >
            <X size={20} />
          </button>
          <div className="eyebrow">OPERATOR PREFERENCES</div>
          <h2>SETTINGS</h2>
          <fieldset className="graphics-setting">
            <legend>Graphics quality</legend>
            <div role="radiogroup" aria-label="Graphics quality">
              {(['low', 'medium', 'high'] as const).map((value) => (
                <label
                  key={value}
                  className={graphics === value ? 'selected' : ''}
                >
                  <input
                    type="radio"
                    name="graphics-quality"
                    value={value}
                    checked={graphics === value}
                    onChange={() => setGraphics(value)}
                  />
                  <span>
                    {value === 'low'
                      ? 'FRACO'
                      : value === 'medium'
                        ? 'MEDIO'
                        : 'FORTE'}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Look sensitivity <b>{sensitivity.toFixed(1)}</b>
          </label>
          <Slider
            aria-label="Look sensitivity"
            min={0.3}
            max={2.5}
            step={0.1}
            value={[sensitivity]}
            onValueChange={(v) => setSensitivity(Array.isArray(v) ? v[0] : v)}
          />
          <div className="setting-row">
            <label htmlFor="sound">Audio enabled</label>
            <Switch
              id="sound"
              checked={!muted}
              onCheckedChange={(v) => setMuted(!v)}
            />
          </div>
          <div className="settings-actions">
            {roomCode && (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  leaveRoom();
                  setSettings(false);
                }}
              >
                <DoorOpen size={16} /> SAIR DA SALA
              </button>
            )}
            <button type="button" className="link-button" onClick={signOut}>
              <LogOut size={16} /> SAIR DA CONTA
            </button>
          </div>
          <button className="deploy-button" onClick={() => setSettings(false)}>
            APPLY &amp; RETURN
            <ChevronRight size={20} />
          </button>
        </section>
      )}
      {session && !active && (
        <footer className="menu-footer">
          <div className="controls">
            <span>
              <kbd>W A S D</kbd> MOVE
            </span>
            <span>
              <kbd>MOUSE</kbd> LOOK
            </span>
            <span>
              <kbd>SHIFT</kbd> RUN
            </span>
            <span>
              <kbd>SPACE</kbd> JUMP
            </span>
            <span>
              <kbd>ESC</kbd> PAUSE
            </span>
          </div>
          <div className="build-mark">DESKTOP EXPERIENCE</div>
        </footer>
      )}
      <div className="mobile-warning">
        <MoveUpRight size={20} />
        <span>Best played on desktop with a keyboard and mouse.</span>
      </div>
    </main>
  );
}
