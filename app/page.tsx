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
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { Game, Snapshot } from './game/engine';
import type { GraphicsPreset } from './game/graphics';
import { api } from './api';
import { Notepad, Calculator, PlaqueEditor } from './game/desktop';
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
};

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
  const selfId = useRef('');
  const [players, setPlayers] = useState<import('./game/net').NetPlayer[]>([]);
  const [netOnline, setNetOnline] = useState(true);
  const [welcome, setWelcome] = useState<import('./game/net').Welcome | null>(null);
  const [plaquesText, setPlaquesText] = useState<Record<string, string>>({});
  const { windows, open, close, minimize, focus, move, hydrate } = useWindows();
  const [desktopFiles, setDesktopFiles] = useState<DesktopFile[]>([]);
  const [filesTick, setFilesTick] = useState(0);
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
  useEffect(() => {
    if (!session) return;
    let disposed = false;
    void import('./game/net').then(({ Net }) => {
      if (disposed) return;
      const n = new Net();
      net.current = n;
      n.onStatus = (online) => setNetOnline(online);
      n.onPlayers = applyPlayers;
      n.onWelcome = (w) => {
        selfId.current = w.id;
        setWelcome(w);
        setPlaquesText(w.plaques);
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
      n.onLight = (roomId, on) => engine.current?.applyLight(roomId, on);
      n.connect(session.token);
      if (engine.current) {
        engine.current.onLocalMove = (x, z, yaw) => n.move(x, z, yaw);
        engine.current.onToggleLight = (roomId, on) => n.light(roomId, on);
      }
    });
    return () => {
      disposed = true;
      net.current?.close();
      net.current = null;
    };
  }, [session, ready, applyPlayers]);
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
  const start = () => {
    setSettings(false);
    const s = welcome?.spawn;
    if (s) engine.current?.spawnAt(s.x, s.z, s.yaw);
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
              setAuthBusy(true);
              setAuthError('');
              try {
                const { token, username: name } = await api.auth(
                  authMode,
                  username,
                  password,
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
            {authError && <p className="login-error">{authError}</p>}
            <button className="deploy-button" disabled={authBusy}>
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
      {active && state.prompt && (
        <output className="interact-toast">{state.prompt}</output>
      )}
      {active && (
        <div className="hud-players" data-testid="hud-players">
          <span className="hud-dot" /> {players.length} NA SALA
          <ul>
            {players.map((p) => (
              <li key={p.id}>{p.username}</li>
            ))}
          </ul>
          {!netOnline && <em>modo solo</em>}
        </div>
      )}
      {active && (
        <div className="hud-fps" data-testid="hud-fps">
          {state.fps} FPS
        </div>
      )}
      {state.desktop && (
        <dialog className="xp" open aria-label="Área de trabalho">
          <div className="xp-icons">
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
                onOpen={() => open('notepad')}
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
              onMove={move}
            >
              {w.app === 'notepad' && state.desktopRoom && (
                <Notepad
                  computerId={state.desktopRoom}
                  onChanged={() => setFilesTick((t) => t + 1)}
                />
              )}
              {w.app === 'calc' && <Calculator />}
              {w.app === 'plaque' && state.desktopRoom && (
                <PlaqueEditor
                  key={plaquesText[state.desktopRoom] ?? ''}
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
            <div className="xp-clock">{clock}</div>
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
      {session && !active && !settings && !state.desktop && (
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
            disabled={!ready || !!error}
          >
            {state.mode === 'paused'
              ? 'CONTINUAR VISITA'
              : ready
                ? 'ENTRAR NO ESCRITÓRIO'
                : 'INICIALIZANDO'}
            <ArrowUpRight size={22} />
          </button>
          {state.mode === 'paused' && (
            <button
              className="restart-button"
              onClick={() => engine.current?.restart()}
            >
              <RotateCcw size={14} /> RECOMEÇAR
            </button>
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
