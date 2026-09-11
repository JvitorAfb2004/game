'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

type FileRow = { id: string; computerId: string; name: string; content: string };

export function Notepad({
  computerId,
  initialFileId,
  refreshKey = 0,
  onChanged,
  onCreated,
}: {
  computerId: string;
  initialFileId?: string;
  refreshKey?: number;
  onChanged?: () => void;
  onCreated?: (id: string) => void;
}) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialFileId ?? null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(!initialFileId);
  const [newName, setNewName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef(0);
  useEffect(() => {
    if (creating) nameRef.current?.focus();
  }, [creating]);
  const active = files.find((f) => f.id === activeId) ?? null;
  const load = useCallback(async () => {
    try {
      const { files: rows } = await api.authed<{ files: FileRow[] }>(
        `/files?computer=${computerId}`,
      );
      setFiles(rows);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'erro ao carregar');
    }
  }, [computerId]);
  useEffect(() => {
    let active = true;
    api
      .authed<{ files: FileRow[] }>(`/files?computer=${computerId}`)
      .then(({ files: rows }) => {
        if (!active) return;
        setFiles(rows);
        if (initialFileId) {
          const f = rows.find((r) => r.id === initialFileId);
          if (f) {
            setActiveId(f.id);
            setDraft(f.content);
            setCreating(false);
          }
        }
      })
      .catch((e) => {
        if (active) setStatus(e instanceof Error ? e.message : 'erro ao carregar');
      });
    return () => {
      active = false;
    };
  }, [computerId, initialFileId, refreshKey]);
  useEffect(() => {
    if (!activeId) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await api.authed(`/files/${activeId}`, {
          method: 'PUT',
          body: JSON.stringify({ content: draft }),
        });
        setStatus('salvo');
      } catch (e) {
        setStatus(e instanceof Error ? e.message : 'erro ao salvar');
      }
    }, 800);
    return () => window.clearTimeout(saveTimer.current);
  }, [draft, activeId]);
  const create = async (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    try {
      const { file } = await api.authed<{ file: FileRow }>('/files', {
        method: 'POST',
        body: JSON.stringify({ computer: computerId, name: clean, content: '' }),
      });
      await load();
      if (onCreated) {
        onCreated(file.id);
      } else {
        setActiveId(file.id);
        setDraft('');
        setCreating(false);
        setNewName('');
        setStatus('');
      }
      onChanged?.();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'erro ao criar');
    }
  };
  const saveNow = async () => {
    if (!activeId) return;
    setStatus('salvando…');
    try {
      await api.authed(`/files/${activeId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: draft }),
      });
      setStatus('salvo');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'erro ao salvar');
    }
  };
  const open = (f: FileRow) => {
    setActiveId(f.id);
    setDraft(f.content);
    setStatus('');
  };
  const remove = async (id: string) => {
    await api.authed(`/files/${id}`, { method: 'DELETE' }).catch(() => {});
    if (activeId === id) {
      setActiveId(null);
      setDraft('');
    }
    void load();
    onChanged?.();
  };
  return (
    <div className="xp-app">
      <div className="xp-app-bar">
        {active ? `${active.name} — Bloco de notas` : 'Bloco de notas'}
      </div>
      <div className="xp-toolbar">
        <button type="button" onClick={() => setCreating(true)}>
          + Novo arquivo
        </button>
        {activeId && (
          <button type="button" onClick={saveNow}>
            Salvar
          </button>
        )}
      </div>
      <ul className="xp-files">
        {files.length === 0 && <li className="xp-empty">nenhum arquivo</li>}
        {files.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => open(f)}>
              {f.name}
            </button>
            <button
              type="button"
              aria-label={`excluir ${f.name}`}
              onClick={() => remove(f.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {activeId && (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            aria-label="conteúdo do arquivo"
          />
          <small>{status}</small>
        </>
      )}
      {creating && (
        <form
          className="xp-modal"
          onSubmit={(e) => {
            e.preventDefault();
            void create(newName);
          }}
        >
          <label>
            Nome do arquivo
            <input
              ref={nameRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={40}
            />
          </label>
          <div className="xp-modal-actions">
            <button type="submit">OK</button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewName('');
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function PlaqueEditor({
  roomId,
  initial,
  onSave,
}: {
  roomId: string;
  initial: string;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <div className="xp-app">
      <div className="xp-app-bar">Placa da sala — {roomId}</div>
      <label>
        Nome exibido no LED
        <input
          value={text}
          maxLength={14}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <button type="button" onClick={() => onSave(text)}>
        Aplicar
      </button>
      <small>até 14 caracteres</small>
    </div>
  );
}

export function Calculator() {
  const [display, setDisplay] = useState('0');
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);
  const compute = (a: number, b: number, o: string) => {
    switch (o) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '*':
        return a * b;
      case '/':
        return b === 0 ? NaN : a / b;
      default:
        return b;
    }
  };
  const press = (k: string) => {
    if (k === 'C') {
      setDisplay('0');
      setAcc(null);
      setOp(null);
      setFresh(true);
      return;
    }
    if (k === '=') {
      if (op !== null && acc !== null) {
        setDisplay(String(compute(acc, parseFloat(display), op)));
        setAcc(null);
        setOp(null);
        setFresh(true);
      }
      return;
    }
    if (['+', '-', '*', '/'].includes(k)) {
      const b = parseFloat(display);
      setAcc(acc !== null && op !== null && !fresh ? compute(acc, b, op) : b);
      setOp(k);
      setFresh(true);
      return;
    }
    if (k === '.') {
      setDisplay(fresh ? '0.' : display.includes('.') ? display : `${display}.`);
      setFresh(false);
      return;
    }
    setDisplay(fresh ? k : display + k);
    setFresh(false);
  };
  return (
    <div className="xp-app">
      <div className="xp-app-bar">Calculadora</div>
      <output className="xp-calc-screen">{display}</output>
      <div className="xp-calc-keys">
        {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', 'C', '='].map(
          (k) => (
            <button type="button" key={k} onClick={() => press(k)}>
              {k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
