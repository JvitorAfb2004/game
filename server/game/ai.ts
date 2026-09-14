// ponytail: bate-papo dos bots via NVIDIA NIM (OpenAI-compatible).
// Sem NIM_API_KEY no ambiente: retorna null e o jogo usa as falas locais.
const BASE = 'https://integrate.api.nvidia.com/v1';
const MODEL = process.env.NIM_MODEL ?? 'meta/llama-3.1-8b-instruct';

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

export async function nimChat(messages: ChatMsg[]): Promise<string | null> {
  const key = process.env.NIM_API_KEY ?? '';
  if (!key) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.9, max_tokens: 120 }),
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

export function cleanReply(text: string): { say: string; bravo: boolean } {
  const bravo = /\[BRAVO\]/i.test(text);
  const say = text
    .replace(/\[CALMO\]/gi, '')
    .replace(/\[BRAVO\]/gi, '')
    .trim()
    .slice(0, 220);
  return { say, bravo: bravo && say.length > 0 };
}
