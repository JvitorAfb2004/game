export type NetPlayer = {
  id: string;
  username: string;
  character?: string;
  x: number;
  z: number;
  yaw: number;
  y?: number;
  using?: string | null;
};
export type ChatOpt = { id: string; label: string };
export type CompanyBot = {
  id: string;
  ticket: number;
  name: string;
  want: string;
  kind: 'dev' | 'off';
  hard: boolean;
  lines: number;
  value: number;
  deadlineDays: number;
  state: string;
  stage: string;
  counter: number;
  projectId: string | null;
  chat?: { say: string; sub: string; opts: ChatOpt[] };
};
export type CompanyProject = {
  id: string;
  client: string;
  title: string;
  value: number;
  received: number;
  linesTotal: number;
  linesDone: number;
  dueAbs: number;
  status: string;
  workers: string[];
  devs: string[];
};
export type CompanyCandidate = { id: string; name: string; level: string; salary: number; lph: number; role: string };
export type CompanyHired = CompanyCandidate & {
  projectId: string | null;
  post: number | null;
  lastPaidMonth: number;
  hasPC: boolean;
  atWork: boolean;
  calledBy: string | null;
  waitingRH: 'raise' | 'resign' | null;
  workState: 'working' | 'lunch' | 'off';
  stationX: number;
  stationZ: number;
  stationRy: number;
};
export type CompanyMachine = { id: string; where: string; broken: boolean; useHours: number; from: string | null; tier: string; tech: boolean; label: string };
export type CompanyTech = { id: string; name: string; where: string; state: 'toMachine' | 'fixing' | 'collecting' };
export type CompanyRaise = { id: string; freelancerId: string; name: string; type: string; toLevel?: string; newSalary?: number; total?: number };
export type CompanyNotif = { id: string; text: string; when: string };
export type CompanyState = {
  day: number;
  month: number;
  absDay: number;
  clock: string;
  balance: number;
  serving: number | null;
  queue: CompanyBot[];
  attending: CompanyBot | null;
  bills: { id: string; name: string; amount: number; dueDay: number; paidMonth: number; lateFee: number }[];
  projects: CompanyProject[];
  candidates: CompanyCandidate[];
  hired: CompanyHired[];
  debts: { id: string; who: string; amount: number }[];
  requests: CompanyRaise[];
  notifs: CompanyNotif[];
  paused: boolean;
  dollyOwned: boolean;
  dollyPos: { x: number; z: number } | null;
  ownedRooms: string[];
  rentInfo: { entry: number; monthly: number; rooms: string[] };
  rhRoom: string | null;
  stations: ('ok' | 'broken' | 'empty')[];
  machines: CompanyMachine[];
  techs: CompanyTech[];
  roomsPC: Record<string, boolean>;
  deliveries: { id: string; tier: string; etaMin: number }[];
  packages: { id: string; tier: string; claimer: string | null; x: number | null; z: number | null }[];
  log: string[];
};
export type Welcome = {
  id: string;
  roomCode?: string;
  roomName?: string;
  spawn: { x: number; z: number; yaw: number };
  players: NetPlayer[];
  plaques: Record<string, string>;
  lights: Record<string, boolean>;
  company?: CompanyState;
};

// ponytail: VITE_WS_URL=wss://api.seu-dominio.com/ws no build de produção;
// em dev usa ws:// no hostname local (wss:// se a página for https).
const WS_URL =
  import.meta.env.VITE_WS_URL ??
  (typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001/ws`
    : 'ws://localhost:3001/ws');

export class Net {
  ws: WebSocket | null = null;
  online = false;
  fails = 0;
  roomCode: string | null = null;
  private lastToken = '';
  onPlayers: (p: NetPlayer[]) => void = () => {};
  onLight: (roomId: string, on: boolean) => void = () => {};
  onPlaque: (roomId: string, text: string) => void = () => {};
  onWelcome: (w: Welcome) => void = () => {};
  onStatus: (online: boolean) => void = () => {};
  onUsing: (roomId: string | null, ok: boolean) => void = () => {};
  onFiles: (computer: string) => void = () => {};
  onCompany: (c: CompanyState) => void = () => {};
  onCompanyError: (error: string) => void = () => {};

  connect(token: string, roomCode?: string) {
    try {
      this.lastToken = token;
      if (roomCode !== undefined) this.roomCode = roomCode;
      const room = this.roomCode ? `&room=${encodeURIComponent(this.roomCode)}` : '';
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}${room}`);
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
        else if (msg.type === 'using')
          this.onUsing(msg.roomId as string | null, msg.ok as boolean);
        else if (msg.type === 'files') this.onFiles(msg.computer as string);
        else if (msg.type === 'company') this.onCompany(msg.company as CompanyState);
        else if (msg.type === 'companyError' && msg.error) this.onCompanyError(msg.error as string);
      };
      ws.onclose = () => {
        this.online = false;
        this.onStatus(false);
        if (this.fails++ < 3) setTimeout(() => this.connect(this.lastToken), 800 * this.fails);
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
  move(x: number, z: number, yaw: number, y = 0, crouch = false) {
    this.send('move', { x, z, yaw, y, crouch });
  }
  light(roomId: string, on: boolean) {
    this.send('light', { roomId, on });
  }
  using(roomId: string | null) {
    this.send('using', { roomId });
  }
  plaque(roomId: string, text: string) {
    this.send('plaque', { roomId, text });
  }
  callNext() {
    this.send('callNext', {});
  }
  attend(botId: string) {
    this.send('attend', { botId });
  }
  answer(botId: string, accept: boolean) {
    this.send('answer', { botId, accept });
  }
  hold(botId: string) {
    this.send('hold', { botId });
  }
  talk(botId: string, text: string) {
    this.send('talk', { botId, text });
  }
  payBill(billId: string) {
    this.send('payBill', { billId });
  }
  deliver(projectId: string) {
    this.send('deliver', { projectId });
  }
  hire(candidateId: string) {
    this.send('hire', { candidateId });
  }
  assign(freelancerId: string, projectId: string | null) {
    this.send('assign', { freelancerId, projectId });
  }
  paySalary(freelancerId: string) {
    this.send('paySalary', { freelancerId });
  }
  payDebt(debtId: string) {
    this.send('payDebt', { debtId });
  }
  work(projectId: string | null, user?: string) {
    this.send('work', { projectId, user });
  }
  raise(requestId: string, accept: boolean) {
    this.send('raise', { requestId, accept });
  }
  pause(paused: boolean) {
    this.send('pause', { paused });
  }
  fire(freelancerId: string) {
    this.send('fire', { freelancerId });
  }
  post(freelancerId: string, index: number | null) {
    this.send('post', { freelancerId, index });
  }
  buyNotebook(tier: string = 'basico') {
    this.send('buyNotebook', { tier });
  }
  buyDolly() {
    this.send('buyDolly', {});
  }
  dollyPos(x: number, z: number) {
    this.send('dollyPos', { x, z });
  }
  rentRoom(roomId: string) {
    this.send('rentRoom', { roomId });
  }
  setRhRoom(roomId: string) {
    this.send('setRhRoom', { roomId });
  }
  claimBox(boxId: string) {
    this.send('claimBox', { boxId });
  }
  dropBox(boxId: string, x: number, z: number) {
    this.send('dropBox', { boxId, x, z });
  }
  placeBox(boxId: string, station: number | null, room: string | null) {
    this.send('placeBox', { boxId, station, room });
  }
  uninstallMachine(machineId: string) {
    this.send('uninstallMachine', { machineId });
  }
  repairMachine(machineId: string) {
    this.send('repairMachine', { machineId });
  }
  callEmployee(freelancerId: string) {
    this.send('callEmployee', { freelancerId });
  }
  releaseEmployee(freelancerId: string) {
    this.send('releaseEmployee', { freelancerId });
  }
  close() {
    this.fails = 999;
    this.ws?.close();
  }
}
