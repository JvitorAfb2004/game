'use client';
import { useCallback, useRef, useState, type ReactNode } from 'react';

export type XpApp = 'notepad' | 'calc' | 'plaque';
export type Win = {
  id: string;
  app: XpApp;
  x: number;
  y: number;
  minimized: boolean;
  z: number;
};

export const XP_TITLES: Record<XpApp, string> = {
  notepad: 'Bloco de notas',
  calc: 'Calculadora',
  plaque: 'Placa da sala',
};

let seq = 0;

export function useWindows() {
  const [windows, setWindows] = useState<Win[]>([]);
  const zRef = useRef(1);
  const open = useCallback((app: XpApp) => {
    setWindows((ws) => {
      const offset = (ws.length % 5) * 24;
      return [
        ...ws,
        {
          id: `${app}-${++seq}`,
          app,
          x: 72 + offset,
          y: 56 + offset,
          minimized: false,
          z: ++zRef.current,
        },
      ];
    });
  }, []);
  const close = useCallback(
    (id: string) => setWindows((ws) => ws.filter((w) => w.id !== id)),
    [],
  );
  const minimize = useCallback(
    (id: string) =>
      setWindows((ws) =>
        ws.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
      ),
    [],
  );
  const focus = useCallback(
    (id: string) =>
      setWindows((ws) =>
        ws.map((w) =>
          w.id === id ? { ...w, minimized: false, z: ++zRef.current } : w,
        ),
      ),
    [],
  );
  const move = useCallback(
    (id: string, x: number, y: number) =>
      setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, x, y } : w))),
    [],
  );
  const hydrate = useCallback((list: Win[]) => {
    setWindows(list);
    zRef.current = Math.max(1, ...list.map((w) => w.z));
  }, []);
  return { windows, open, close, minimize, focus, move, hydrate };
}

export function XPWindow({
  win,
  title,
  onFocus,
  onClose,
  onMinimize,
  onMove,
  children,
}: {
  win: Win;
  title: string;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  children: ReactNode;
}) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  if (win.minimized) return null;
  return (
    <section
      className="xp-window"
      style={{ left: win.x, top: win.y, zIndex: win.z }}
      onPointerDown={() => onFocus(win.id)}
    >
      <div
        className="xp-titlebar"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          onFocus(win.id);
          drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          onMove(
            win.id,
            Math.max(0, e.clientX - drag.current.dx),
            Math.max(0, e.clientY - drag.current.dy),
          );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <span className="xp-title">{title}</span>
        <span className="xp-controls">
          <button
            type="button"
            aria-label="Minimizar"
            onClick={() => onMinimize(win.id)}
          >
            _
          </button>
          <button type="button" aria-label="Fechar" onClick={() => onClose(win.id)}>
            ✕
          </button>
        </span>
      </div>
      <div className="xp-body">{children}</div>
    </section>
  );
}
