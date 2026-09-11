export type NetPlayer = { id: string; username: string; x: number; z: number; yaw: number };
export type Welcome = {
  spawn: { x: number; z: number; yaw: number };
  players: NetPlayer[];
  plaques: Record<string, string>;
  lights: Record<string, boolean>;
};

const HOST = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const WS_URL = `ws://${HOST}:3001/ws`;

export class Net {
  ws: WebSocket | null = null;
  online = false;
  fails = 0;
  onPlayers: (p: NetPlayer[]) => void = () => {};
  onLight: (roomId: string, on: boolean) => void = () => {};
  onPlaque: (roomId: string, text: string) => void = () => {};
  onWelcome: (w: Welcome) => void = () => {};
  onStatus: (online: boolean) => void = () => {};

  connect(token: string) {
    try {
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      this.ws = ws;
      ws.onopen = () => {
        this.fails = 0;
        this.online = true;
        this.onStatus(true);
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string) as { type: string } & Record<string, unknown>;
        if (msg.type === 'welcome') this.onWelcome(msg as unknown as Welcome);
        else if (msg.type === 'players') this.onPlayers(msg.players as NetPlayer[]);
        else if (msg.type === 'light') this.onLight(msg.roomId as string, msg.on as boolean);
        else if (msg.type === 'plaque') this.onPlaque(msg.roomId as string, msg.text as string);
      };
      ws.onclose = () => {
        this.online = false;
        this.onStatus(false);
        if (this.fails++ < 3) setTimeout(() => this.connect(token), 800 * this.fails);
      };
      ws.onerror = () => ws.close();
    } catch {
      this.online = false;
      this.onStatus(false);
    }
  }
  private send(type: string, payload: Record<string, unknown>) {
    if (this.online && this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ type, ...payload }));
  }
  move(x: number, z: number, yaw: number) {
    this.send('move', { x, z, yaw });
  }
  light(roomId: string, on: boolean) {
    this.send('light', { roomId, on });
  }
  plaque(roomId: string, text: string) {
    this.send('plaque', { roomId, text });
  }
  close() {
    this.fails = 999;
    this.ws?.close();
  }
}
