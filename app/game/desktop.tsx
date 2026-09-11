'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

type FileRow = { id: string; computerId: string; name: string; content: string };

export function Notepad({ computerId }: { computerId: string }) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const saveTimer = useRef(0);
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
        if (active) setFiles(rows);
      })
      .catch((e) => {
        if (active) setStatus(e instanceof Error ? e.message : 'erro ao carregar');
      });
    return () => {
      active = false;
    };
  }, [computerId]);
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
  const create = async () => {
    const name = prompt('Nome do arquivo');
    if (!name) return;
    try {
      const { file } = await api.authed<{ file: FileRow }>('/files', {
        method: 'POST',
        body: JSON.stringify({ computer: computerId, name, content: '' }),
      });
      await load();
      setActiveId(file.id);
      setDraft('');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'erro ao criar');
    }
  };
  const open = (f: FileRow) => {
    setActiveId(f.id);
    setDraft(f.content);
  };
  const remove = async (id: string) => {
    await api.authed(`/files/${id}`, { method: 'DELETE' }).catch(() => {});
    if (activeId === id) {
      setActiveId(null);
      setDraft('');
    }
    void load();
  };
  return (
    <div className="xp-app">
      <div className="xp-app-bar">Bloco de notas — {computerId}</div>
      <button type="button" onClick={create}>
        + Novo arquivo
      </button>
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
        {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', 'C', '+'].map(
          (k) => (
            <button type="button" key={k} onClick={() => press(k)}>
              {k}
            </button>
          ),
        )}
        <button type="button" onClick={() => press('=')}>
          =
        </button>
      </div>
    </div>
  );
}
