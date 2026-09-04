'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  ArrowUpRight,
  Shield,
  Radio,
  RotateCcw,
  ChevronRight,
  Settings2,
  X,
  MoveUpRight,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { Game, Snapshot } from './game/engine';

const initial: Snapshot = {
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
export default function Home() {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<Game | null>(null);
  const [state, setState] = useState(initial),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [settings, setSettings] = useState(false),
    [muted, setMuted] = useState(false),
    [sensitivity, setSensitivity] = useState(1),
    [cinematic, setCinematic] = useState(true),
    [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    let disposed = false;
    import('./game/engine').then(({ Game }) => {
      if (disposed || !host.current) return;
      try {
        engine.current = new Game(host.current, setState);
        setReady(true);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : 'Unable to initialize graphics.',
        );
      }
    });
    return () => {
      disposed = true;
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.configure({ muted, sensitivity, cinematic });
  }, [muted, sensitivity, cinematic, ready]);
  useEffect(() => {
    const f = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  const active = state.mode === 'playing';
  const start = () => {
    setSettings(false);
    engine.current?.start();
  };
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };
  return (
    <main
      className={`game-root ${active ? 'is-playing' : ''} ${state.aiming ? 'is-aiming' : ''}`}
    >
      <div
        className="scene"
        ref={host}
        aria-label="Three-dimensional Blackwater terminal combat environment"
      />
      <div className="film-grain" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <div
        className="damage-overlay"
        style={{
          opacity: Math.min(
            0.8,
            state.damage * 0.65 + (state.health < 35 && active ? 0.3 : 0),
          ),
        }}
      />
      <header className="topbar">
        <div className="wordmark">
          <span className="brand-mark">
            B<span>\</span>
          </span>
          <span>
            BLACKWATER<span className="wordmark-sub">SPECIAL OPERATIONS</span>
          </span>
        </div>
        <div className="top-middle">
          <span className="live-dot" />
          {active ? 'OPERATION LIVE' : 'OPERATION 01'}
          <span className="top-divider" />
          NORTH ATLANTIC
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
      {active && (
        <>
          <div className="compass">
            <span>NW</span>
            <i />
            <span>
              {String(Math.round(state.heading / 10) * 10).padStart(3, '0')}
            </span>
            <i />
            <span>NE</span>
            <b>◆</b>
          </div>
          <section className="objective">
            <span className="eyebrow">CURRENT OBJECTIVE</span>
            <div>
              <span className="objective-diamond">◇</span>
              {state.objective}
            </div>
            <p>
              {state.kills < state.total
                ? `${state.kills} / ${state.total} hostiles neutralized`
                : 'Move to the amber extraction beacon'}
            </p>
          </section>
          <div className={`reticle ${state.hit ? 'hit' : ''}`}>
            <span />
            <span />
            <span />
            <span />
            <i />
            {state.hit > 0 && <b>×</b>}
          </div>
          {state.notice && (
            <div
              className={`combat-notice ${state.notice.startsWith('FREE CURSOR') ? 'input-notice' : ''}`}
              key={state.notice}
            >
              <span /> {state.notice}
            </div>
          )}
          {state.reloading && (
            <div className="reload-notice">
              RELOADING <span>•••</span>
            </div>
          )}
          <div className="hud-bottom">
            <div className="operator">
              <div className="operator-heading">
                <Shield size={18} />
                <span>VIPER 01</span>
                <b>{Math.ceil(state.health)}</b>
              </div>
              <div className="health-track">
                <div style={{ width: `${state.health}%` }} />
              </div>
              <span className="health-label">
                {state.health < 35 ? 'SEEK COVER' : 'COMBAT EFFECTIVE'}
              </span>
              <div className="mini-map">
                <svg viewBox="0 0 160 120" aria-label="Tactical radar">
                  <defs>
                    <pattern
                      id="mapgrid"
                      width="16"
                      height="16"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 16 0 L 0 0 0 16"
                        fill="none"
                        stroke="#73918c"
                        strokeWidth=".4"
                      />
                    </pattern>
                  </defs>
                  <rect width="160" height="120" fill="url(#mapgrid)" />
                  <path
                    d="M20 5h30v28H20zm85 12h23v34h-23zM32 55h24v28H32zm70 17h35v18h-35zM15 95h34v12H15"
                    fill="#698077"
                    opacity=".5"
                  />
                  {state.enemies.map((e, i) => (
                    <circle
                      key={i}
                      cx={80 + e.x * 2.5}
                      cy={95 + (e.z - 13) * 1.5}
                      r="2"
                      fill="#f4a06b"
                    />
                  ))}
                  <g
                    transform={`translate(${80 + state.player.x * 2.5} ${95 + (state.player.z - 13) * 1.5}) rotate(${state.heading})`}
                  >
                    <path d="M0 -5L4 4L0 2L-4 4Z" fill="#d9f1d4" />
                  </g>
                </svg>
                <span>
                  SECTOR 04 <b>N ↑</b>
                </span>
              </div>
            </div>
            <div className="bottom-hint">
              <kbd>R</kbd> RELOAD <span /> <kbd>SHIFT</kbd> SPRINT <span />{' '}
              <kbd>ESC</kbd> PAUSE
            </div>
            <div className="ammo">
              <span className="weapon-label">
                MR-17 CARBINE <i>5.56 × 45</i>
              </span>
              <div>
                <strong className={state.ammo < 8 ? 'low' : ''}>
                  {String(state.ammo).padStart(2, '0')}
                </strong>
                <span>/ {String(state.reserve).padStart(3, '0')}</span>
              </div>
              <p>
                <span>▰ ▰ ▰</span> FULL AUTO
              </p>
            </div>
          </div>
          {state.extraction > 0 && (
            <div className="extract-progress">
              <span>EXTRACTING</span>
              <div style={{ width: `${state.extraction * 100}%` }} />
            </div>
          )}
        </>
      )}
      {!active && <div className="menu-shade" />}
      {!active && !settings && (
        <section className="mission-menu">
          <div className="mission-kicker">
            <span />{' '}
            {state.mode === 'complete'
              ? 'MISSION ACCOMPLISHED'
              : state.mode === 'dead'
                ? 'SIGNAL LOST'
                : state.mode === 'paused'
                  ? 'OPERATION PAUSED'
                  : 'SINGLE PLAYER · TACTICAL ASSAULT'}
          </div>
          <h1>
            {state.mode === 'complete' ? (
              <>
                TERMINAL
                <br />
                <em>SECURED.</em>
              </>
            ) : state.mode === 'dead' ? (
              <>
                OPERATOR
                <br />
                <em>DOWN.</em>
              </>
            ) : (
              <>
                SILENT
                <br />
                <em>HARBOR</em>
                <span className="title-period">.</span>
              </>
            )}
          </h1>
          <div className="mission-location">
            <span>04</span>
            <div>
              BLACKWATER FREIGHT TERMINAL
              <small>
                59° 19′ N &nbsp; 04° 52′ E &nbsp; / &nbsp; 04:38 HRS
              </small>
            </div>
          </div>
          <p className="mission-description">
            {state.mode === 'complete'
              ? 'The terminal is secure. All hostiles neutralized. Viper team is coming home.'
              : state.mode === 'dead'
                ? 'Your signal went dark. Regroup, use cover, and retake the terminal.'
                : 'A storm. A missing shipment. Nine hostile contacts. Infiltrate the terminal, clear the perimeter, and reach extraction.'}
          </p>
          {(state.mode === 'dead' || state.mode === 'complete') && (
            <div className="debrief">
              <span>
                <b>{state.kills}</b>NEUTRALIZED
              </span>
              <span>
                <b>{`${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`}</b>
                ELAPSED
              </span>
            </div>
          )}
          <button
            className="deploy-button"
            onClick={start}
            disabled={!ready || !!error}
          >
            {state.mode === 'paused'
              ? 'RESUME OPERATION'
              : state.mode === 'complete'
                ? 'REDEPLOY'
                : state.mode === 'dead'
                  ? 'RETRY OPERATION'
                  : ready
                    ? 'BEGIN OPERATION'
                    : 'INITIALIZING'}
            <ArrowUpRight size={22} />
          </button>
          {state.mode === 'paused' && (
            <button
              className="restart-button"
              onClick={() => engine.current?.restart()}
            >
              <RotateCcw size={14} /> RESTART OPERATION
            </button>
          )}
          {error && (
            <p className="error-message">
              Graphics could not start. Try a desktop browser with WebGL
              enabled.<small>{error}</small>
            </p>
          )}
          <div className="loadout">
            <Crosshair size={18} />
            <div>
              <span>YOUR LOADOUT</span>
              <b>
                MR-17 CARBINE <small> / HOLOGRAPHIC</small>
              </b>
            </div>
            <span className="loadout-bars">▰ ▰ ▰ ▰ ▱</span>
          </div>
        </section>
      )}
      {!active && !settings && (
        <aside className="sector-card">
          <span className="sector-corner" />
          <div>
            <span className="live-dot" /> FIELD INTELLIGENCE
          </div>
          <h2>CONTAINER YARD</h2>
          <p>Visibility reduced. Watch your angles.</p>
          <div className="weather">
            <span>↙ 18 KTS</span>
            <span>08°C</span>
            <span>HEAVY RAIN</span>
          </div>
          <div className="sector-line" />
          <small>
            VIPER TEAM <span>● COMMS ONLINE</span>
          </small>
        </aside>
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
          <div className="setting-row">
            <label htmlFor="cinematic">
              Cinematic effects<small>Bloom, lighting and film treatment</small>
            </label>
            <Switch
              id="cinematic"
              checked={cinematic}
              onCheckedChange={setCinematic}
            />
          </div>
          <button className="deploy-button" onClick={() => setSettings(false)}>
            APPLY & RETURN
            <ChevronRight size={20} />
          </button>
        </section>
      )}
      {!active && (
        <footer className="menu-footer">
          <div className="controls">
            <span>
              <kbd>W A S D</kbd> MOVE
            </span>
            <span>
              <kbd>MOUSE</kbd> LOOK / FIRE
            </span>
            <span>
              <kbd>RMB / Q</kbd> AIM
            </span>
            <span>
              <kbd>R</kbd> RELOAD
            </span>
            <span>
              <kbd>SPACE</kbd> JUMP
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
