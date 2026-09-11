const HOST = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const BASE = `http://${HOST}:3001`;
const TOKEN_KEY = 'meridian_token';
const USER_KEY = 'meridian_user';

async function doFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error('Sem conexão com o servidor');
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await doFetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'erro de rede');
  return data as T;
}

export const api = {
  token: () => localStorage.getItem(TOKEN_KEY),
  username: () => localStorage.getItem(USER_KEY),
  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  async auth(kind: 'register' | 'login', username: string, password: string) {
    const data = await post<{ token: string; username: string }>(`/auth/${kind}`, {
      username,
      password,
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, data.username);
    return data;
  },
  async authed<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await doFetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${this.token()}`,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? 'erro de rede');
    return data as T;
  },
};
