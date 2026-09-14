// ponytail: sim in-memory da empresa (tempo + bots + equipe + financeiro manual).
// Persiste em data/company.json (sem migração). Apague o arquivo para recomeçar.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { nimChat, cleanReply, type ChatMsg } from './ai.ts';

export type BotState = 'waiting' | 'called' | 'attending' | 'done' | 'left';
export type BotStage = 'ask' | 'haggle' | 'pickup';
export type Persona = 'normal' | 'zueiro' | 'grosso';
export type Bot = {
  id: string;
  ticket: number;
  name: string;
  want: string;
  kind: 'dev' | 'off';
  hard: boolean;
  lines: number;
  value: number;
  deadlineDays: number;
  state: BotState;
  stage: BotStage;
  counter: number;
  projectId: string | null;
  persona: Persona;
  aiSay: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  bravo: number;
  lastTalk: number;
};
export type Bill = {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  paidMonth: number;
  lateFee: number;
};
export type DevLevel = 'junior' | 'pleno' | 'senior';
export type Level = DevLevel | 'recep' | 'cook';
export type Role = 'dev' | 'recep' | 'manager' | 'cook';
export type Candidate = { id: string; name: string; level: Level; salary: number; lph: number; role: Role };
export type Hired = {
  id: string;
  name: string;
  level: Level;
  salary: number;
  lph: number;
  role: Role;
  projectId: string | null;
  post: number | null;
  lastCall: number;
  lastPaidMonth: number;
  hiredDay: number;
  askDay: number;
  atWork: boolean;
  calledBy?: string | null; // playerId que chamou (NPC segue ele); null = rotina normal
  waitingRH?: 'raise' | 'resign' | null; // aguardando resposta no RH (vai e volta até resolver)
  workState: 'working' | 'lunch' | 'off';
  stationX: number;
  stationZ: number;
  stationRy: number;
  thirteenthAccrued: number;  // 13º acumulado no ano (1/12 por mês trabalhado)
  vacationAccrued: number;    // férias acumuladas (1/12 por mês)
};
export type Debt = { id: string; who: string; amount: number };
export type Notif = { id: string; text: string; when: string };
export type PendingFine = { name: string; amount: number; dueAbs: number };
export type Delivery = { id: string; arrivesAbsMin: number; tier?: PcTier; price?: number };
export type Pkg = { id: string; x?: number; z?: number; tier?: PcTier; price?: number };
export type PcTier = 'basico' | 'inter' | 'premium';
// ponytail: quebra por HORAS REAIS de uso (lifespanH), não sorteio diário
export const PC_TIERS: Record<PcTier, { price: number; breakRate: number; label: string; lifespanH: number }> = {
  basico: { price: 3500, breakRate: 0.04, label: 'Básico', lifespanH: 500 },
  inter: { price: 6000, breakRate: 0.015, label: 'Intermediário', lifespanH: 1200 },
  premium: { price: 10000, breakRate: 0.005, label: 'Premium', lifespanH: 2500 },
};
export type Machine = { id: string; where: string; broken: boolean; from?: string; tier?: PcTier; price?: number; useHours?: number }; // st:N | rm:SALA | box
export type Tech = { id: string; name: string; machineId: string; where: string; state: 'toMachine' | 'fixing' | 'collecting'; arriveAbsMin: number; fixAbsMin: number; scrap?: number };
export const DEV_STATIONS = 12;
export const NOTEBOOK_PRICE = 3500;
export const REPAIR_PRICE = 800;
export const DOLLY_PRICE = 1500;
// ponytail: salas alugáveis — entrada + mensalidade (dia 10); W1+E1+copa+recepção vêm abertas
export const ROOM_RENT = { entry: 6000, monthly: 1500, rooms: ['W2', 'W3', 'E2', 'E3'] };
const ROOM_IDS_ALL = ['W1', 'W2', 'W3', 'E1', 'E2', 'E3'];
export type RaiseRequest = {
  id: string;
  freelancerId: string;
  name: string;
  toLevel: DevLevel;
  newSalary: number;
  type: 'raise';
};
export type ResignationRequest = {
  id: string;
  freelancerId: string;
  name: string;
  role: Role;
  salary: number;
  hiredDay: number;
  absDay: number;
  // valores calculados
  salaryBalance: number;
  thirteenth: number;
  vacation: number;
  fgts: number;
  noticeIndemnity: number;
  total: number;
  type: 'resign';
};
export type Request = RaiseRequest | ResignationRequest;
export type Project = {
  id: string;
  client: string;
  title: string;
  value: number;
  received: number;
  linesTotal: number;
  linesDone: number;
  dueAbs: number;
  status: 'active' | 'delivered';
};

// 1 seg real = 1min de jogo (dia = 24min reais). Ritmo de simulação.
export const GAME_MIN_PER_SEC = 1;
export const PLAYER_LPH = 100; // dono rende como um junior (linhas por hora de jogo)
const START_BALANCE = 10000;
const MAX_QUEUE = 4;
const MAX_CANDIDATES = 6;
const SALARY_DUE_DAY = 5;
const HEARTBEAT_MS = 15000;
const LATE_PENALTY_DAY = 0.05; // entrega atrasada: -5%/dia no restante
const CHILIQUE_CHANCE = 0.12; // ~1 em 8 entregas: cliente não paga e exige o sinal de volta

// Simples Nacional 2026 - anexo III (serviços de TI) - faixas anuais
const SIMPLES_BRACKETS = [
  { max: 180000, rate: 0.06, ded: 0 },
  { max: 360000, rate: 0.112, ded: 9360 },
  { max: 720000, rate: 0.135, ded: 17640 },
  { max: 1800000, rate: 0.16, ded: 35640 },
  { max: 3600000, rate: 0.21, ded: 125640 },
  { max: 4800000, rate: 0.33, ded: 648000 },
];
// Encargos patronais sobre folha (2026)
const INSS_PATRONAL = 0.20;      // 20% INSS patronal
const FGTS_RATE = 0.08;          // 8% FGTS
const RAT_SAT_RATE = 0.02;       // 2% RAT/SAT (médio risco)
const SISTEMA_S_RATE = 0.058;    // 5,8% Sistema S (SESI, SENAI, etc)
const PAYROLL_TAX_RATE = INSS_PATRONAL + FGTS_RATE + RAT_SAT_RATE + SISTEMA_S_RATE; // ~35.8%

const LEVEL_INFO: Record<DevLevel, { salary: [number, number]; lph: number }> = {
  junior: { salary: [2200, 3200], lph: 100 },
  pleno: { salary: [4800, 6000], lph: 200 },
  senior: { salary: [9000, 11500], lph: 350 },
};
const NEXT_LEVEL: Record<DevLevel, DevLevel> = { junior: 'pleno', pleno: 'senior', senior: 'senior' };

const NAMES_FIRST = ['Marcos','Ana','Jorge','Lia','Paulo','Bia','Caio','Duda','Rafa','Nina','Theo','Mila','Ruan','Cleo','Davi','Elisa','Fabio','Gabi','Hugo','Iara'];
const NAMES_LAST = ['Silva','Souza','Lima','Rocha','Pires','Moura','Freitas','Barros','Teixeira','Moreira','Campos','Peixoto','Farias','Nogueira','Sales','Xavier'];
const FREELA_FIRST = ['Igor','Sofia','Otto','Maya','Theo','Luna','Gael','Iris','Noah','Ayla','Ravi','Elsa','Bento','Clara','Dante','Eva','Flora','Gustavo'];
const DEV_WANTS = [
  'Sistema de estoque',
  'App de agendamento',
  'Site da loja',
  'ERP pequeno',
  'Dashboard de vendas',
  'Sistema de delivery',
];
const OFF_WANTS = [
  'Construção de casa',
  'Bolo de festa',
  'Conserto de carro',
  'Aula de violão',
  'Corte de cabelo',
  'Pizza grande',
];

let seq = 0;
const rid = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;
const brl = (v: number) => `R$${Math.round(v).toLocaleString('pt-BR')}`;
const SAVE_PATH = join(process.cwd(), 'data', 'company.json');

function pickPersona(): Persona {
  const r = Math.random();
  return r < 0.6 ? 'normal' : r < 0.85 ? 'zueiro' : 'grosso';
}
const PERSONA_PT: Record<Persona, string> = { normal: 'tranquilo 🙂', zueiro: 'zueiro 😎', grosso: 'grosso 😡' };
const PERSONA_DESC: Record<Persona, string> = {
  normal: 'Be polite and normal.',
  zueiro: 'Be funny and playful, crack a light joke.',
  grosso: 'Be rude, impatient and condescending.',
};

export class CompanySim {
  minute = 8 * 60; // dia 1, 08:00
  day = 1;
  month = 1;
  absDay = 1;
  balance = START_BALANCE;
  monthRevenue = 0; // faturamento do mês para cálculo do Simples
  ticket = 0;
  serving: number | null = null;
  bots: Bot[] = [];
  projects: Project[] = [];
  candidates: Candidate[] = [];
  hired: Hired[] = [];
  debts: Debt[] = [];
  requests: Request[] = [];
  notifs: Notif[] = [];
  pendingFines: PendingFine[] = [];
  machines: Machine[] = [];
  dollyOwned = false; // carrinho comprado na loja (aparece no spawn)
  dollyPos: { x: number; z: number } | null = null; // última posição largada (persiste por sala)
  rhRoom: string | null = 'W1'; // sala de RH (configurável): pedidos de aumento/demissão esperam lá
  ownedRooms: string[] = ['W1', 'E1']; // copa, recepção e spawn sempre abertos; demais se aluga
  deliveries: Delivery[] = [];
  packages: Pkg[] = [];
  claims: Record<string, { playerId: string; name: string }> = {};
  techs: Tech[] = [];
  manualPause = false;
  autoPaused = false;
  private emptyFor = 0;
  log: string[] = [];
  bills: Bill[] = [
    { id: 'aluguel', name: 'Aluguel escritório', amount: 8000, dueDay: 10, paidMonth: 0, lateFee: 0 },
    { id: 'energia', name: 'Energia', amount: 1200, dueDay: 10, paidMonth: 0, lateFee: 0 },
    { id: 'agua', name: 'Água', amount: 400, dueDay: 10, paidMonth: 0, lateFee: 0 },
    { id: 'internet', name: 'Internet', amount: 600, dueDay: 10, paidMonth: 0, lateFee: 0 },
    { id: 'gov', name: 'Taxas governo', amount: 1500, dueDay: 10, paidMonth: 0, lateFee: 0 },
  ];
  private spawnIn = 15; // game-min até próximo bot
  private workBeats = new Map<string, { projectId: string; at: number; name: string }>();
  private lastRebalance = 0;
  changed = true;

  push(msg: string) {
    this.log.unshift(`D${this.day} ${this.clock()} — ${msg}`);
    this.log = this.log.slice(0, 30);
    this.changed = true;
  }
  /** notificação importante: celular + toast de todos os logados */
  notify(text: string) {
    this.notifs.unshift({ id: rid('notif'), text, when: `D${this.day} ${this.clock()}` });
    this.notifs = this.notifs.slice(0, 20);
    this.changed = true;
  }
  get paused() {
    return this.manualPause || this.autoPaused;
  }
  setPaused(v: boolean) {
    this.manualPause = v;
    this.push(v ? 'Jogo pausado (tempo congelado).' : 'Jogo despausado.');
    this.changed = true;
  }
  /** sem ninguém na sala por 5min reais: pausa; alguém voltou: despausa */
  autoPause(dtSec: number, hasPlayers: boolean) {
    if (hasPlayers) {
      this.emptyFor = 0;
      if (this.autoPaused) {
        this.autoPaused = false;
        this.push('Alguém voltou — jogo despausado.');
        this.changed = true;
      }
      return;
    }
    this.emptyFor += dtSec;
    if (this.emptyFor >= 300 && !this.autoPaused) {
      this.autoPaused = true;
      this.push('Sala vazia há 5min — jogo pausado.');
      this.changed = true;
    }
  }
  /** nome único (clientes + freelas + contratados + projetos) */
  uniqueName(first: string[], last: string[]): string {
    const used = new Set([
      ...this.bots.map((b) => b.name),
      ...this.candidates.map((c) => c.name),
      ...this.hired.map((h) => h.name),
      ...this.projects.map((p) => p.client),
    ]);
    for (let i = 0; i < 40; i++) {
      const n = `${first[Math.floor(Math.random() * first.length)]} ${last[Math.floor(Math.random() * last.length)]}`;
      if (!used.has(n)) return n;
    }
    return `${first[0]} ${last[0]} ${Math.floor(Math.random() * 99)}`;
  }
  clock() {
    const h = String(Math.floor(this.minute / 60)).padStart(2, '0');
    const m = String(this.minute % 60).padStart(2, '0');
    return `${h}:${m}`;
  }
  absMinNow() {
    return (this.absDay - 1) * 1440 + this.minute;
  }
  /** máquina em uso: estação com dev alocado em projeto ativo; sala com projeto ativo rodando */
  machineInUse(where: string): boolean {
    if (where === 'box') return false;
    const hasActiveWork = this.projects.some((p) => p.status === 'active' && p.linesDone < p.linesTotal);
    if (!hasActiveWork) return false;
    if (where.startsWith('st:')) {
      const idx = Number(where.slice(3));
      const devs = this.hired.filter((h) => h.role === 'dev');
      const h = devs[idx];
      return !!h && h.projectId !== null && this.projects.some((p) => p.id === h.projectId && p.status === 'active');
    }
    return true; // rm:SALA: em uso se há obra ativa (sala de dev ocupada)
  }
  /** estação do dev para novo contratado (ordem de contratação) */
  devStationForHire(role: Role): { x: number; z: number; ry: number } {
    if (role === 'cook') {
      // cozinheira atrás do balcão da copa
      return { x: 15.4, z: 16, ry: -Math.PI / 2 };
    }
    if (role === 'recep') {
      const posts = [-1.8, 0, 1.8];
      const idx = this.hired.filter((h) => h.role === 'recep').length;
      const px = posts[idx % posts.length];
      return { x: px, z: -27.7, ry: Math.PI };
    }
    if (role === 'manager') {
      // gerente em posto próprio ao norte da sala de devs (fora das 12 estações, de frente p/ equipe)
      return { x: 6.6, z: 5.9, ry: 0 };
    }
    const devIdx = this.hired.filter((h) => h.role === 'dev').length;
    const stations = [
      { x: 6.6, z: 7.6, ry: Math.PI / 2 }, { x: 8.6, z: 7.6, ry: -Math.PI / 2 },
      { x: 6.6, z: 9.6, ry: Math.PI / 2 }, { x: 8.6, z: 9.6, ry: -Math.PI / 2 },
      { x: 6.6, z: 11.6, ry: Math.PI / 2 }, { x: 8.6, z: 11.6, ry: -Math.PI / 2 },
      { x: 6.6, z: 5.6, ry: Math.PI / 2 }, { x: 8.6, z: 5.6, ry: -Math.PI / 2 },
      { x: 6.6, z: 3.6, ry: Math.PI / 2 }, { x: 8.6, z: 3.6, ry: -Math.PI / 2 },
      { x: 6.6, z: 1.6, ry: Math.PI / 2 }, { x: 8.6, z: 1.6, ry: -Math.PI / 2 },
    ];
    return stations[devIdx % stations.length];
  }
  /** índice da estação do dev (ordem de contratação, igual no cliente) */
  devStationOf(fid: string): number {
    return this.hired.filter((h) => h.role === 'dev').findIndex((h) => h.id === fid);
  }
  /** máquina funcionando na estação (dev só rende com ela) */
  machineAtStation(idx: number) {
    return this.machines.find((m) => m.where === `st:${idx}` && !m.broken);
  }
  machineInRoom(roomId: string) {
    return this.machines.find((m) => m.where === `rm:${roomId}`);
  }
  /** 'ok' | 'broken' | 'empty' por estação (cliente acende o monitor) */
  stationStates(): ('ok' | 'broken' | 'empty')[] {
    return Array.from({ length: DEV_STATIONS }, (_, i) => {
      const m = this.machines.find((x) => x.where === `st:${i}`);
      return !m ? 'empty' : m.broken ? 'broken' : 'ok';
    });
  }
    roomsPC(): Record<string, boolean> {
    const map: Record<string, boolean> = { REC: true, REC2: true, REC3: true };
    for (const r of ROOM_IDS_ALL) {
      const m = this.machineInRoom(r);
      map[r] = !!m && !m.broken;
    }
    return map;
  }
  /** freela só rende em horário comercial com pausa de almoço (8-12h, 13-18h) */
  commercialNow() {
    const h = this.minute / 60;
    return (h >= 8 && h < 12) || (h >= 13 && h < 18);
  }
  snapshot() {
    const workers = new Map<string, string[]>();
    const now = Date.now();
    for (const [, w] of this.workBeats)
      if (now - w.at < HEARTBEAT_MS) {
        const list = workers.get(w.projectId) ?? [];
        if (!list.includes(w.name)) list.push(w.name);
        workers.set(w.projectId, list);
      }
    const attending = this.bots.find((b) => b.state === 'attending') ?? null;
    return {
      day: this.day,
      month: this.month,
      absDay: this.absDay,
      clock: this.clock(),
      balance: Math.round(this.balance * 100) / 100,
      serving: this.serving,
      queue: this.bots.filter((b) => b.state === 'waiting' || b.state === 'called'),
      attending: attending ? { ...attending, chat: this.chatFor(attending) } : null,
      bills: this.bills,
      projects: this.projects.map((p) => ({
        ...p,
        workers: workers.get(p.id) ?? [],
        devs: this.hired.filter((h) => h.projectId === p.id).map((h) => h.name),
      })),
      candidates: this.candidates,
      hired: this.hired.map((h) => ({
        ...h,
        hasPC: h.role === 'dev' ? !!this.machineAtStation(this.devStationOf(h.id)) : true,
      })),
      debts: this.debts,
      requests: this.requests,
      notifs: this.notifs,
      paused: this.paused,
      dollyOwned: this.dollyOwned,
      dollyPos: this.dollyPos,
      ownedRooms: [...this.ownedRooms],
      rentInfo: { ...ROOM_RENT },
      rhRoom: this.rhRoom,
      stations: this.stationStates(),
      machines: this.machines.map((m) => ({
        id: m.id,
        where: m.where,
        broken: m.broken,
        useHours: Math.round((m.useHours ?? 0) * 10) / 10,
        from: m.from ?? null,
        tier: m.tier ?? 'basico',
        tech: this.techs.some((t) => t.machineId === m.id),
        label:
          m.where === 'box'
            ? 'na caixa'
            : m.where.startsWith('st:')
              ? `Estação ${Number(m.where.slice(3)) + 1} (${PC_TIERS[m.tier ?? 'basico']?.label ?? ''})`
              : `Sala ${m.where.slice(3)} (${PC_TIERS[m.tier ?? 'basico']?.label ?? ''})`,
      })),
      deliveries: this.deliveries.map((d) => ({ id: d.id, tier: d.tier ?? 'basico', etaMin: Math.max(0, Math.round(d.arrivesAbsMin - this.absMinNow())) })),
      packages: this.packages.map((p) => ({ id: p.id, tier: p.tier ?? 'basico', claimer: this.claims[p.id]?.name ?? null, x: p.x ?? null, z: p.z ?? null })),
      techs: this.techs.map((t) => ({ id: t.id, name: t.name, where: t.where, state: t.state })),
      roomsPC: this.roomsPC(),
      log: this.log,
    };
  }
  tick(dtSec: number) {
    if (this.paused) return;
    const add = dtSec * GAME_MIN_PER_SEC;
    const gameHours = add / 60;
    this.minute += add;
    while (this.minute >= 1440) {
      this.minute -= 1440;
      this.day += 1;
      this.absDay += 1;
      if (this.day > 30) {
        this.day = 1;
        this.month += 1;
        this.push(`Mês ${this.month} começou. Contas e salários a pagar (manual).`);
        this.genCandidates(2);
        // 13º e férias: acumula 1/12 por mês trabalhado
        for (const h of this.hired) {
          h.thirteenthAccrued = Math.round((h.thirteenthAccrued + h.salary / 12) * 100) / 100;
          h.vacationAccrued = Math.round((h.vacationAccrued + h.salary / 12) * 100) / 100;
        }
        // pedido de demissão aleatório (~5%/mês por funcionário com >30 dias de casa)
        // vai à sala de RH e espera a resposta (volta todo dia até resolver)
        for (const h of this.hired) {
          if (this.absDay - h.hiredDay >= 30 && !this.requests.some((r) => r.freelancerId === h.id) && Math.random() < 0.05) {
            const r = this.makeResignRequest(h);
            this.requests.push(r);
            h.waitingRH = 'resign';
            this.push(`📝 ${h.name} pediu demissão! Foi à sala ${this.rhRoom ?? '?'} — fale com ele (E). Acerto: ${brl(r.total)}.`);
            this.notify(`📝 ${h.name} pediu demissão! Está na sala ${this.rhRoom ?? '?'}.`);
          }
        }
        // reset acumulados anuais no mês 1 (janeiro) — 13º pago em dezembro
        if (this.month === 1) {
          for (const h of this.hired) {
            h.thirteenthAccrued = 0;
            h.vacationAccrued = 0;
          }
        }
        // --- IMPOSTOS MENSAIS (Simples Nacional + Encargos Patronais) ---
        // 1) Simples Nacional sobre faturamento do mês anterior
        const annualRevenue = this.monthRevenue * 12; // projeta anual
        let simplesRate = 0, simplesDed = 0;
        for (const b of SIMPLES_BRACKETS) {
          if (annualRevenue <= b.max) { simplesRate = b.rate; simplesDed = b.ded; break; }
        }
        const simplesMonthly = Math.max(0, Math.round((this.monthRevenue * simplesRate - simplesDed / 12) * 100) / 100);
        // 2) Encargos patronais sobre folha (INSS 20% + FGTS 8% + RAT/SAT 2% + Sistema S 5,8% = ~35,8%)
        const payrollTotal = this.hired.reduce((s, h) => s + h.salary, 0);
        const payrollTax = Math.round(payrollTotal * PAYROLL_TAX_RATE * 100) / 100;
        // Adiciona como contas a pagar (vencem dia 20)
        this.bills.push({ id: `simples-M${this.month-1}`, name: `Simples Nacional (M${this.month-1})`, amount: simplesMonthly, dueDay: 20, paidMonth: 0, lateFee: 0 });
        this.bills.push({ id: `encargos-M${this.month-1}`, name: `Encargos patronais (M${this.month-1})`, amount: payrollTax, dueDay: 20, paidMonth: 0, lateFee: 0 });
        this.push(`📊 Impostos M${this.month-1}: Simples ${brl(simplesMonthly)} + Encargos ${brl(payrollTax)} (folha ${brl(payrollTotal)}). Vencem dia 20.`);
        this.notify(`📊 Impostos do mês anterior: ${brl(simplesMonthly + payrollTax)} a pagar dia 20.`);
        // reseta faturamento do mês
        this.monthRevenue = 0;
      }
      // multa 2%/dia em conta vencida não paga — sem débito automático
      for (const b of this.bills) {
        if (b.paidMonth !== this.month && this.day > b.dueDay) {
          const was = b.lateFee;
          const fee = Math.round(b.amount * 0.02 * 100) / 100;
          b.lateFee = Math.round((b.lateFee + fee) * 100) / 100;
          if (!was) this.notify(`⚠️ ${b.name} venceu! Multa de 2%/dia correndo.`);
        }
      }
      // multas de denúncia vencidas viram dívida
      for (const f of this.pendingFines.filter((x) => x.dueAbs <= this.absDay)) {
        this.pendingFines = this.pendingFines.filter((x) => x !== f);
        this.debts.push({ id: rid('debt'), who: `Multa — denúncia de ${f.name}`, amount: f.amount });
        this.notify(`🚨 Multa de ${brl(f.amount)}! Denúncia de ${f.name}.`);
        this.push(`Multa aplicada: denúncia de ${f.name} (${brl(f.amount)}).`);
      }
      // dívidas de ex-freelas: juros 5%/dia
      for (const d of this.debts) d.amount = Math.round(d.amount * 1.05 * 100) / 100;
      // ponytail: sem sorteio diário — desgaste acumula por hora real de uso (ver bloco gameHours)
      // salário vencido (dia 5): freela sai, vira dívida
      for (const h of this.hired) {
        if (h.lastPaidMonth < this.month && this.day > SALARY_DUE_DAY) {
          this.hired = this.hired.filter((x) => x.id !== h.id);
          this.requests = this.requests.filter((r) => r.freelancerId !== h.id);
          this.debts.push({ id: rid('debt'), who: `${h.name} (salário M${this.month})`, amount: h.salary });
          this.push(`${h.name} saiu por falta de pagamento. Dívida de ${brl(h.salary)} com juros.`);
          this.notify(`🚪 ${h.name} saiu! Dívida de ${brl(h.salary)} com juros.`);
        }
      }
      // depois de ~14 dias de casa, dev e gerente pedem aumento (vão ao RH esperar)
      for (const h of this.hired) {
        if (
          (h.role === 'dev' || h.role === 'manager') &&
          this.absDay - h.hiredDay >= 14 &&
          this.absDay - h.askDay >= 20 &&
          !this.requests.some((r) => r.freelancerId === h.id) &&
          Math.random() < 0.1
        ) {
          const toLevel = NEXT_LEVEL[h.level as DevLevel];
          const bump = toLevel === h.level ? 1.15 : 1;
          const info = LEVEL_INFO[toLevel];
          const newSalary =
            toLevel === h.level
              ? Math.round((h.salary * bump) / 100) * 100
              : Math.round((info.salary[0] + Math.random() * (info.salary[1] - info.salary[0])) / 100) * 100;
          h.askDay = this.absDay;
          h.waitingRH = 'raise';
          this.requests.push({ id: rid('req'), freelancerId: h.id, name: h.name, toLevel, newSalary, type: 'raise' });
          this.push(`${h.name} pediu aumento (${toLevel}, ${brl(newSalary)}/mês). Foi à sala ${this.rhRoom ?? '?'} — fale com ele (E).`);
          this.notify(`📢 ${h.name} quer aumento! Está na sala ${this.rhRoom ?? '?'}.`);
        }
      }
      this.changed = true;
    }
    // chegada/saída primeiro: quem chegou neste tick já produz nele
    this.updateAtWork();
    // desgaste real: máquina em uso acumula horas; quebra ao atingir a vida útil do tier
    if (gameHours > 0) {
      for (const m of this.machines) {
        if (m.where === 'box' || m.broken || !this.machineInUse(m.where)) continue;
        m.useHours = Math.round(((m.useHours ?? 0) + gameHours) * 10) / 10;
        const life = PC_TIERS[m.tier ?? 'basico']?.lifespanH ?? 500;
        if (m.useHours < life) continue;
        m.broken = true;
        const where = m.where.startsWith('st:')
          ? `estação ${Number(m.where.slice(3)) + 1}`
          : `sala ${m.where.slice(3)}`;
        this.push(`🔧 Máquina quebrou: ${where}! (${Math.round(m.useHours)}h de uso). Conserte no Estoque.`);
        this.notify(`🔧 Máquina quebrou (${where})! Conserto: ${brl(REPAIR_PRICE)}.`);
      }
      const now = Date.now();
      const playerLines = new Map<string, number>();
      for (const [, w] of this.workBeats)
        if (now - w.at < HEARTBEAT_MS)
          playerLines.set(w.projectId, (playerLines.get(w.projectId) ?? 0) + PLAYER_LPH * gameHours);
      const commercial = this.commercialNow();
      let moved = false;
      for (const p of this.projects) {
        if (p.status !== 'active') continue;
        let gain = playerLines.get(p.id) ?? 0;
        // dev só rende com máquina funcionando na estação dele E estando no trabalho
        if (commercial)
          for (const h of this.hired) {
            if (h.role !== 'dev' || h.projectId !== p.id) continue;
            if (!h.atWork || h.calledBy || h.waitingRH) continue; // chamado ou no RH: parado
            if (!this.machineAtStation(this.devStationOf(h.id))) continue;
            gain += h.lph * gameHours;
          }
        if (gain > 0 && p.linesDone < p.linesTotal) {
          p.linesDone = Math.min(p.linesTotal, Math.round((p.linesDone + gain) * 10) / 10);
          moved = true;
          if (p.linesDone >= p.linesTotal) {
            // 100%: desvincula os devs sozinhos
            const freed = this.hired.filter((h) => h.projectId === p.id).map((h) => h.name);
            for (const h of this.hired) if (h.projectId === p.id) h.projectId = null;
            this.push(`${p.title} pronto para entregar.${freed.length ? ` ${freed.join(', ')} liberado(s).` : ''}`);
            this.notify(`✅ ${p.title} pronto para entregar!`);
          }
        }
      }
      if (moved) this.changed = true;
    }
    this.spawnIn -= add;
    const waiting = this.bots.filter((b) => b.state === 'waiting').length;
    if (waiting < MAX_QUEUE) this.maybeReturn();
    // gerente: distribui devs livres (com PC) nos projetos por vencimento
    this.rebalance(this.absMinNow());
    // entregas de notebook vencidas viram caixas no spawn
    const nowMin = this.absMinNow();
    for (const d of this.deliveries.filter((x) => x.arrivesAbsMin <= nowMin)) {
      this.deliveries = this.deliveries.filter((x) => x !== d);
      this.packages.push({ id: d.id, tier: d.tier ?? 'basico', price: d.price ?? PC_TIERS.basico.price });
      this.notify('📦 Encomenda chegou no spawn! Pegue a caixa.');
      this.push('Caixa de notebook chegou no spawn.');
    }
    // técnicos: só trabalham de manhã (8-12h), chegam, consertam após ~2h, vão embora
    // coleta de sucata: técnico busca a máquina, sai com a caixa e paga 10% do preço
    const hour = this.minute / 60;
    const isMorning = hour >= 8 && hour < 12;
    const isBusinessHour = (hour >= 8 && hour < 12) || (hour >= 13 && hour < 18);
    const isClosingSoon = hour >= 17.5 && hour < 18;
    for (const t of this.techs) {
      const m = this.machines.find((x) => x.id === t.machineId);
      if (t.state === 'collecting') {
        if (!m) {
          this.techs = this.techs.filter((x) => x !== t);
          continue;
        }
        if (!isMorning) continue;
        if (nowMin >= t.fixAbsMin) {
          const scrap = t.scrap ?? Math.round(((m.price ?? PC_TIERS.basico.price) * 0.1) * 100) / 100;
          this.machines = this.machines.filter((x) => x.id !== m.id);
          this.packages = this.packages.filter((p) => p.id !== m.id);
          this.balance = Math.round((this.balance + scrap) * 100) / 100;
          this.techs = this.techs.filter((x) => x !== t);
          this.push(`📦 ${t.name} levou a máquina com a caixa. Sucata: +${brl(scrap)}.`);
          this.notify(`📦 Técnico recolheu a máquina (+${brl(scrap)} de sucata).`);
          this.changed = true;
        } else if (t.state === 'collecting' && nowMin >= t.arriveAbsMin) {
          this.push(`📦 ${t.name} chegou para buscar a máquina.`);
          this.changed = true;
        }
        continue;
      }
      if (!m || m.where === 'box' || !m.broken) {
        this.techs = this.techs.filter((x) => x !== t);
        continue;
      }
      // técnico só avança se for manhã
      if (!isMorning) continue;
      if (t.state === 'toMachine' && nowMin >= t.arriveAbsMin) {
        t.state = 'fixing';
        this.push(`🔧 ${t.name} chegou e está consertando.`);
        this.changed = true;
      } else if (t.state === 'fixing' && nowMin >= t.fixAbsMin) {
        m.broken = false;
        m.useHours = 0; // conserto zera o desgaste
        this.techs = this.techs.filter((x) => x !== t);
        this.push(`🔧 ${t.name} consertou a máquina.`);
        this.notify(`🔧 Máquina consertada!`);
        this.changed = true;
      }
    }
    // recepcionistas no balcão chamam a fila sozinhas (1 chamada / 30 game-min, metade do ritmo)
    // e atendem em etapas: cada ação consome o intervalo (chamar num tick, fechar no próximo)
    const absMin = (this.absDay - 1) * 1440 + this.minute;
    for (const h of this.hired) {
      if (h.role !== 'recep' || h.post === null || h.calledBy || h.waitingRH) continue;
      if (absMin - h.lastCall < 30) continue;
      const busy = this.bots.some((b) => b.state === 'called' || b.state === 'attending');
      // pechincha/entrega pendente resolve primeiro (uma etapa por ciclo)
      const pending = this.bots.find((b) => b.state === 'attending' && (b.stage === 'haggle' || b.stage === 'pickup'));
      if (pending) {
        h.lastCall = absMin;
        this.answer(pending.id, true); // aceita o mínimo / entrega
        this.push(`💁 ${h.name} fechou com ${pending.name} no balcão.`);
        continue;
      }
      if (busy) continue;
      const next = this.bots.find((b) => b.state === 'waiting');
      if (next) {
        h.lastCall = absMin;
        this.callNext();
      }
      this.recepAuto(h.name);
    }
    // clientes respeitam horário comercial: chegam de 8-12 e 13-18 (não tudo junto)
    // spawn escalonado: um por vez durante expediente
    if (isBusinessHour && this.spawnIn <= 0) {
      const waiting = this.bots.filter((b) => b.state === 'waiting' || b.state === 'called').length;
      if (waiting < MAX_QUEUE) this.spawnBot();
      // intervalo variável: 20-40 min de jogo entre chegadas
      this.spawnIn = 20 + Math.random() * 20;
      this.changed = true;
    }
    // fechando: clientes na fila vão embora um por um após 17:30
    if (isClosingSoon) {
      const inLine = this.bots.filter((b) => b.state === 'waiting' || b.state === 'called');
      if (inLine.length > 0 && Math.random() < 0.15) {
        const leaving = inLine[Math.floor(Math.random() * inLine.length)];
        leaving.state = 'left';
        this.push(`🚪 ${leaving.name} foi embora (escritório fechando).`);
        this.changed = true;
      }
    }
    // depois das 18h: limpa fila restante
    if (hour >= 18) {
      const inLine = this.bots.filter((b) => b.state === 'waiting' || b.state === 'called' || b.state === 'attending');
      for (const b of inLine) {
        b.state = 'left';
        this.push(`🚪 ${b.name} foi embora (expediente encerrado).`);
      }
      this.changed = true;
    }
    this.changed = true;
  }
  /** chegada/almoço/saída dos colaboradores (roda antes do progresso: quem chega já produz) */
  updateAtWork() {
    // horário comercial 8-12 / 13-18, almoço 12-13
    const hour = this.minute / 60;
    const isMorning = hour >= 8 && hour < 12;
    const isLunch = hour >= 12 && hour < 13;
    const isAfternoon = hour >= 13 && hour < 18;
    const commercial = isMorning || isAfternoon;
    for (const h of this.hired) {
      if (h.calledBy) continue; // chamado: fica com o jogador até liberar (sem almoço/saída)
      if (commercial && !isLunch) {
        if (!h.atWork) {
          h.atWork = true;
          h.workState = 'working';
          this.push(`👋 ${h.name} chegou para trabalhar.`);
        }
      } else if (isLunch) {
        if (h.atWork) {
          h.atWork = false;
          h.workState = 'lunch';
          this.push(`🍽️ ${h.name} saiu para almoçar.`);
        }
      } else {
        if (h.atWork) {
          h.atWork = false;
          h.workState = 'off';
          this.push(`🚪 ${h.name} foi embora (fim do expediente).`);
        }
      }
    }
  }
  genCandidates(n: number) {
    for (let i = 0; i < n && this.candidates.length < MAX_CANDIDATES; i++) {
      const r = Math.random();
      const level: DevLevel = r < 0.5 ? 'junior' : r < 0.8 ? 'pleno' : 'senior';
      const info = LEVEL_INFO[level];
      const salary = Math.round((info.salary[0] + Math.random() * (info.salary[1] - info.salary[0])) / 100) * 100;
      const name = this.uniqueName(FREELA_FIRST, NAMES_LAST);
      this.candidates.push({ id: rid('cand'), name, level, salary, lph: info.lph, role: 'dev' });
    }
    // recepcionista: 1 vaga por mês (máx 2 na casa entre fila e contratados)
    const recepCount =
      this.candidates.filter((c) => c.role === 'recep').length +
      this.hired.filter((h) => h.role === 'recep').length;
    if (recepCount < 2) {
      const salary = Math.round((1800 + Math.random() * 700) / 100) * 100;
      this.candidates.push({
        id: rid('cand'), name: this.uniqueName(FREELA_FIRST, NAMES_LAST),
        level: 'recep', salary, lph: 0, role: 'recep',
      });
    }
    // cozinheira: máx 3 na casa (fila + contratadas); sem cozinheira o pessoal almoça em casa
    const cookCount =
      this.candidates.filter((c) => c.role === 'cook').length +
      this.hired.filter((h) => h.role === 'cook').length;
    if (cookCount < 3) {
      const salary = Math.round((1800 + Math.random() * 700) / 100) * 100;
      this.candidates.push({
        id: rid('cand'), name: this.uniqueName(FREELA_FIRST, NAMES_LAST),
        level: 'cook', salary, lph: 0, role: 'cook',
      });
    }
    // gerente: 1 vaga (só cabe um na empresa)
    const managerCount =
      this.candidates.filter((c) => c.role === 'manager').length +
      this.hired.filter((h) => h.role === 'manager').length;
    if (managerCount < 1) {
      const salary = Math.round((3500 + Math.random() * 1500) / 100) * 100;
      this.candidates.push({
        id: rid('cand'), name: this.uniqueName(FREELA_FIRST, NAMES_LAST),
        level: 'junior', salary, lph: 0, role: 'manager',
      });
    }
    this.changed = true;
  }
  spawnBot() {
    const isDev = Math.random() < 0.55;
    const hard = Math.random() < 0.3;
    const name = this.uniqueName(NAMES_FIRST, NAMES_LAST);
    this.ticket += 1;
    const lines = isDev ? (hard ? 8000 + Math.floor(Math.random() * 6000) : 3000 + Math.floor(Math.random() * 4000)) : 0;
    const value = isDev ? Math.round((lines * (hard ? 1.1 : 0.7) + 800) / 100) * 100 : 0;
    this.bots.push({
      id: rid('bot'),
      ticket: this.ticket,
      name,
      want: isDev
        ? DEV_WANTS[Math.floor(Math.random() * DEV_WANTS.length)]
        : OFF_WANTS[Math.floor(Math.random() * OFF_WANTS.length)],
      kind: isDev ? 'dev' : 'off',
      hard,
      lines,
      value,
      deadlineDays: isDev ? 3 + Math.floor(Math.random() * 5) : 0,
      state: 'waiting',
      stage: 'ask',
      counter: 0,
      projectId: null,
      persona: pickPersona(),
      aiSay: '',
      history: [],
      bravo: 0,
      lastTalk: 0,
    });
    this.push(`Cliente ${name} chegou (senha ${this.ticket}).`);
  }
  /** cliente volta no prazo para buscar o projeto pronto e pagar o restante */
  maybeReturn() {
    const inLine = this.bots.filter(
      (b) => b.state === 'waiting' || b.state === 'called' || b.state === 'attending',
    ).length;
    if (inLine >= MAX_QUEUE + 1) return;
    for (const p of this.projects) {
      if (p.status !== 'active' || p.linesDone < p.linesTotal || this.absDay < p.dueAbs) continue;
      if (this.bots.some((b) => b.projectId === p.id && b.state !== 'done' && b.state !== 'left')) continue;
      this.ticket += 1;
      this.bots.push({
        id: rid('bot'),
        ticket: this.ticket,
        name: p.client,
        want: p.title,
        kind: 'dev',
        hard: false,
        lines: p.linesTotal,
        value: p.value,
        deadlineDays: 0,
        state: 'waiting',
        stage: 'pickup',
        counter: 0,
        projectId: p.id,
        persona: 'normal',
        aiSay: '',
        history: [],
        bravo: 0,
        lastTalk: 0,
      });
      this.push(`${p.client} voltou para buscar ${p.title} (senha ${this.ticket}).`);
      return;
    }
  }
  callNext(): Bot | null {
    const next = this.bots.find((b) => b.state === 'waiting');
    if (!next) return null;
    for (const b of this.bots) if (b.state === 'called') b.state = 'waiting';
    next.state = 'called';
    this.serving = next.ticket;
    this.push(`Senha ${next.ticket} chamada (${next.name}).`);
    this.changed = true;
    return next;
  }
  attend(id: string, silent = false): Bot | null {
    const b = this.bots.find((x) => x.id === id);
    if (!b || (b.state !== 'called' && b.state !== 'waiting')) return null;
    for (const x of this.bots) if (x.state === 'attending') x.state = 'left';
    b.state = 'attending';
    b.persona ??= pickPersona();
    this.changed = true;
    // IA gera a fala de abertura (assíncrono; cai no fallback local se falhar)
    if (!silent) void this.aiOpening(b);
    return b;
  }
  private aiSystem(b: Bot): string {
    return [
      `You are ${b.name}, a client at the reception of MERIDIAN DEV, a Brazilian software house.`,
      `Personality: ${PERSONA_DESC[b.persona] ?? PERSONA_DESC.normal}`,
      `You are speaking PT-BR, informal, brief: MAX 25 words per message.`,
      `If the attendant offends you, answer offended and end with [BRAVO], else end with [CALMO].`,
    ].join(' ');
  }
  private async aiOpening(b: Bot) {
    const topic = b.stage === 'pickup' ? `came to pick up the finished project "${b.want}"` : `wants "${b.want}"`;
    const text = await nimChat([
      { role: 'system', content: this.aiSystem(b) },
      { role: 'user', content: `Your ticket was just called. Greet the attendant and say you ${topic}.` },
    ]);
    if (b.state !== 'attending' || !text) return;
    const { say, bravo } = cleanReply(text);
    if (!say) return;
    b.aiSay = say;
    b.history.push({ role: 'assistant', content: say });
    if (bravo) this.bravoHit(b);
    else this.changed = true;
  }
  /** bate-papo livre: fala com o cliente (sabor; xingar pode dar denúncia) */
  talk(id: string, text: string): string {
    const b = this.bots.find((x) => x.id === id && x.state === 'attending');
    if (!b) return 'atendimento inválido';
    const clean = text.trim().slice(0, 140);
    if (!clean) return 'fala vazia';
    if (Date.now() - b.lastTalk < 3000) return 'devagar! espera 3s';
    b.lastTalk = Date.now();
    b.history.push({ role: 'user', content: clean });
    b.history = b.history.slice(-6);
    this.changed = true;
    void (async () => {
      const msgs: ChatMsg[] = [
        { role: 'system', content: this.aiSystem(b) },
        ...b.history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      ];
      const reply = await nimChat(msgs);
      if (b.state !== 'attending' || !reply) return;
      const { say, bravo } = cleanReply(reply);
      if (!say) return;
      b.aiSay = say;
      b.history.push({ role: 'assistant', content: say });
      b.history = b.history.slice(-6);
      if (bravo) this.bravoHit(b);
      else this.changed = true;
    })();
    return 'ok';
  }
  /** cliente estourou: indenização e tchau */
  private bravoHit(b: Bot) {
    b.bravo += 1;
    if (b.bravo < 2) {
      this.changed = true;
      return;
    }
    const amount = (5 + Math.floor(Math.random() * 26)) * 1000;
    this.debts.push({ id: rid('debt'), who: `Indenização — ${b.name}`, amount });
    b.state = 'left';
    this.bots = this.bots.filter((x) => x.state === 'waiting' || x.state === 'called' || x.state === 'attending');
    this.push(`😡 ${b.name} se sentiu ofendido e vai cobrar indenização (${brl(amount)})!`);
    this.notify(`😡 ${b.name} se sentiu ofendido! Indenização de ${brl(amount)}.`);
    this.changed = true;
  }
  chatFor(b: Bot): { say: string; sub: string; opts: { id: string; label: string }[] } {
    const persona = PERSONA_PT[b.persona ?? 'normal'] ?? '';
    if (b.stage === 'pickup') {
      const p = this.projects.find((x) => x.id === b.projectId);
      const rest = p ? Math.round((p.value - p.received) * 100) / 100 : b.value;
      return {
        say: b.aiSay || `Vim buscar ${b.want}. Tá pronto?`,
        sub: `restante ${brl(rest)}${persona ? ` · ${persona}` : ''}`,
        opts: [
          { id: 'yes', label: `Entregar (+${brl(rest)})` },
          { id: 'no', label: 'Ainda não' },
        ],
      };
    }
    if (b.stage === 'haggle') {
      return {
        say: b.aiSay || `${brl(b.value)} tá caro. Fecha por ${brl(b.counter)}?`,
        sub: `cliente difícil pechinchando${persona ? ` · ${persona}` : ''}`,
        opts: [
          { id: 'yes', label: `Aceitar ${brl(b.counter)}` },
          { id: 'hold', label: `Manter ${brl(b.value)}` },
          { id: 'no', label: 'Recusar' },
        ],
      };
    }
    if (b.kind === 'off') {
      return {
        say: b.aiSay || `Vocês fazem ${b.want}?`,
        sub: `fora do nosso escopo (somos software)${persona ? ` · ${persona}` : ''}`,
        opts: [
          { id: 'no', label: 'Não fazemos' },
          { id: 'leave', label: 'Dispensar' },
        ],
      };
    }
    return {
      say: b.aiSay || `Vocês fazem ${b.want}?`,
      sub: `${b.lines.toLocaleString('pt-BR')} linhas · ${brl(b.value)} · ${b.deadlineDays} dias · ${b.hard ? 'cliente difícil' : 'cliente ok'}${persona ? ` · ${persona}` : ''}`,
      opts: [
        { id: 'yes', label: 'Sim, fazemos' },
        { id: 'no', label: 'Não fazemos' },
      ],
    };
  }
  closeDeal(b: Bot, finalValue: number) {
    const entry = Math.round((finalValue * 0.5 * 100)) / 100;
    this.balance = Math.round((this.balance + entry) * 100) / 100;
    this.projects.push({
      id: rid('proj'),
      client: b.name,
      title: b.want,
      value: finalValue,
      received: entry,
      linesTotal: b.lines || 3000,
      linesDone: 0,
      dueAbs: this.absDay + (b.deadlineDays || 5),
      status: 'active',
    });
    b.state = 'done';
    this.push(`${b.name} fechou ${b.want} por ${brl(finalValue)} (+${brl(entry)} entrada). Some e volta no prazo.`);
  }
  answer(id: string, accept: boolean): string {
    const b = this.bots.find((x) => x.id === id && x.state === 'attending');
    if (!b) return 'atendimento inválido';
    if (b.stage === 'pickup') {
      const p = this.projects.find((x) => x.id === b.projectId);
      if (!p) {
        b.state = 'left';
      } else if (!accept) {
        b.state = 'left';
        p.dueAbs = this.absDay + 2; // volta depois
        this.push(`${b.name} volta em 2 dias (ainda não entregamos).`);
      } else {
        const res = this.deliverImpl(p.id, false);
        if (res !== 'ok') return res;
        b.state = 'done';
      }
    } else if (b.stage === 'haggle') {
      if (!accept) {
        b.state = 'left';
        this.push(`${b.name} desistiu da pechincha.`);
      } else {
        this.closeDeal(b, b.counter);
      }
    } else if (!accept || b.kind === 'off') {
      b.state = 'left';
      if (accept && b.kind === 'off') {
        // aceitou o que não faz: cliente se sente enrolado, ameaça denunciar
        const fine = (10 + Math.floor(Math.random() * 41)) * 1000;
        this.pendingFines.push({ name: b.name, amount: fine, dueAbs: this.absDay + 2 + Math.floor(Math.random() * 4) });
        this.push(`😡 ${b.name}: "Vocês mentiram! Vou denunciar!" Saiu furioso.`);
        this.notify(`😡 ${b.name} vai nos denunciar! Multa a caminho...`);
      } else {
        this.push(`${b.name} dispensado (${b.want}: não fazemos).`);
      }
    } else if (b.hard) {
      b.stage = 'haggle';
      b.aiSay = '';
      b.counter = Math.round((b.value * 0.8) / 100) * 100;
      this.push(`${b.name} achou caro e fez contraproposta.`);
    } else {
      this.closeDeal(b, b.value);
    }
    this.bots = this.bots.filter((x) => x.state === 'waiting' || x.state === 'called' || x.state === 'attending');
    this.changed = true;
    return 'ok';
  }
  /** recepcionista atende o chamado sozinha, uma etapa por vez (metade do ritmo) */
  recepAuto(hName: string) {
    if (this.bots.some((b) => b.state === 'attending')) return; // jogador atendendo: não rouba
    const called = this.bots.find((b) => b.state === 'called');
    if (!called) return;
    const b = this.attend(called.id, true);
    if (!b) return;
    this.push(`💁 ${hName} atendeu ${b.name} no balcão.`);
    if (b.stage === 'ask') {
      if (b.kind === 'off') this.answer(b.id, false); // fora do escopo: dispensa
      else this.answer(b.id, true); // fácil fecha; difícil vai p/ pechincha
    }
    const cur = this.bots.find((x) => x.id === b.id);
    // pechincha/entrega resolve no próximo ciclo (uma etapa por vez = metade do ritmo)
    if (cur && cur.state === 'attending' && (cur.stage === 'haggle' || cur.stage === 'pickup')) return;
    this.changed = true;
  }
  /** manter o preço na pechincha: 50% aceita, 50% vai embora */
  hold(id: string): string {
    const b = this.bots.find((x) => x.id === id && x.state === 'attending' && x.stage === 'haggle');
    if (!b) return 'sem pechincha em aberto';
    if (Math.random() < 0.5) {
      this.closeDeal(b, b.value);
    } else {
      b.state = 'left';
      this.bots = this.bots.filter((x) => x.state === 'waiting' || x.state === 'called' || x.state === 'attending');
      this.push(`${b.name} não aceitou manter o preço e foi embora.`);
    }
    this.changed = true;
    return 'ok';
  }
  hire(id: string): string {
    const i = this.candidates.findIndex((c) => c.id === id);
    if (i < 0) return 'candidato inválido';
    const c = this.candidates[i];
    if (c.role === 'dev' && this.hired.filter((h) => h.role === 'dev').length >= DEV_STATIONS)
      return 'sala de devs cheia (12 postos)';
    if (c.role === 'manager' && this.hired.some((h) => h.role === 'manager'))
      return 'só cabe um gerente';
    if (c.role === 'cook' && this.hired.filter((h) => h.role === 'cook').length >= 3)
      return 'copa só tem 3 vagas de cozinheira';
    this.candidates.splice(i, 1);
    const st = this.devStationForHire(c.role);
    this.hired.push({
      ...c, projectId: null, post: null, lastCall: 0,
      lastPaidMonth: this.month, hiredDay: this.absDay, askDay: this.absDay,
      atWork: false, calledBy: null, waitingRH: null, workState: 'off', stationX: st.x, stationZ: st.z, stationRy: st.ry,
      thirteenthAccrued: 0, vacationAccrued: 0,
    });
    this.push(
      c.role === 'manager'
        ? `${c.name} contratado(a) gerente (${brl(c.salary)}/mês). Distribui os devs sozinho.`
        : c.role === 'recep'
          ? `${c.name} contratado(a) recepcionista (${brl(c.salary)}/mês). Aloque num balcão.`
          : `${c.name} contratado (${c.level}, ${brl(c.salary)}/mês, home office).`,
    );
    this.changed = true;
    return 'ok';
  }
  /** demite: gera dívida proporcional aos dias trabalhados no mês (acerto) */
  fire(id: string): string {
    const i = this.hired.findIndex((x) => x.id === id);
    if (i < 0) return 'funcionário inválido';
    const [h] = this.hired.splice(i, 1);
    this.requests = this.requests.filter((r) => r.freelancerId !== id);
    const owed = h.lastPaidMonth === this.month ? 0 : Math.round(((h.salary * this.day) / 30) * 100) / 100;
    if (owed > 0) {
      this.debts.push({ id: rid('debt'), who: `Acerto — ${h.name}`, amount: owed });
      this.push(`${h.name} demitido. Acerto de ${brl(owed)} (${this.day}d trabalhados) virou dívida.`);
      this.notify(`🚪 ${h.name} demitido. Acerto de ${brl(owed)} a pagar!`);
    } else {
      this.push(`${h.name} demitido (mês já pago, sem acerto).`);
    }
    this.changed = true;
    return 'ok';
  }
  /** jogador mirou no NPC e chamou (E): para de trabalhar e segue o jogador até liberar */
  callEmployee(id: string, playerId: string): string {
    const h = this.hired.find((x) => x.id === id);
    if (!h) return 'funcionário inválido';
    if (h.calledBy && h.calledBy !== playerId) return 'já está com outro jogador';
    if (!h.atWork || h.workState !== 'working') return 'fora do expediente';
    h.calledBy = playerId;
    this.push(`📣 ${h.name} chamado por um jogador.`);
    this.changed = true;
    return 'ok';
  }
  /** libera o chamado: volta à estação/balcão na hora */
  releaseEmployee(id: string, playerId: string): string {
    const h = this.hired.find((x) => x.id === id);
    if (!h) return 'funcionário inválido';
    if (h.calledBy && h.calledBy !== playerId) return 'está com outro jogador';
    h.calledBy = null;
    h.atWork = true;
    h.workState = 'working';
    this.push(`👋 ${h.name} liberado, voltou ao trabalho.`);
    this.changed = true;
    return 'ok';
  }
  /** gerente remaneja: dev livre com PC → projeto mais urgente; velocidade sobe com o nível */
  rebalance(nowMin: number) {
    const g = this.hired.find((h) => h.role === 'manager');
    if (!g || g.waitingRH) return; // no RH: não gerencia
    const every = g.level === 'senior' ? 15 : g.level === 'pleno' ? 30 : 60;
    if (nowMin - this.lastRebalance < every) return;
    this.lastRebalance = nowMin;
    const needy = this.projects
      .filter((p) => p.status === 'active' && p.linesDone < p.linesTotal)
      .sort((a, b) => a.dueAbs - b.dueAbs);
    if (!needy.length) return;
    for (const h of this.hired) {
      if (h.role !== 'dev' || h.projectId || h.calledBy || h.waitingRH) continue;
      if (!this.machineAtStation(this.devStationOf(h.id))) continue;
      const target = needy.find((p) => p.linesDone < p.linesTotal);
      if (!target) break;
      h.projectId = target.id;
      this.push(`(gerente ${g.name}) ${h.name} → ${target.title}.`);
    }
    this.changed = true;
  }
  /** recepcionista num balcão (0-2) ou livre */
  post(fid: string, idx: number | null): string {
    const h = this.hired.find((x) => x.id === fid);
    if (!h) return 'funcionário inválido';
    if (h.role !== 'recep') return 'alocar devs em projetos; recepcionista vai ao balcão';
    if (idx !== null && (idx < 0 || idx > 2)) return 'balcão inválido';
    h.post = idx;
    this.push(idx === null ? `${h.name} saiu do balcão.` : `${h.name} assumiu o balcão ${idx + 1}.`);
    this.changed = true;
    return 'ok';
  }
  assign(fid: string, projectId: string | null): string {
    const h = this.hired.find((x) => x.id === fid);
    if (!h) return 'freelancer inválido';
    if (h.role !== 'dev') return 'só devs vão a projetos (gerente se vira, recepcionista vai ao balcão)';
    if (projectId !== null && !this.projects.some((p) => p.id === projectId && p.status === 'active'))
      return 'projeto inválido';
    h.projectId = projectId;
    const p = this.projects.find((x) => x.id === projectId);
    this.push(projectId ? `${h.name} alocado em ${p?.title}.` : `${h.name} liberado dos projetos.`);
    this.changed = true;
    return 'ok';
  }
  /** acerto de demissão a pedido (pedido vai ao RH; negar aumento pode virar isso) */
  makeResignRequest(h: Hired): ResignationRequest {
    const tenureMonths = Math.max(1, Math.floor((this.absDay - h.hiredDay) / 30));
    const salaryBalance = Math.round((h.salary * (this.day - 1) / 30) * 100) / 100;
    const thirteenth = h.thirteenthAccrued;
    const vacation = Math.round(h.vacationAccrued * 4 / 3 * 100) / 100;
    const fgtsBase = h.salary * tenureMonths + thirteenth + vacation;
    const fgts = Math.round((fgtsBase * 0.08 * 1.4) * 100) / 100;
    const noticeIndemnity = h.salary;
    const total = Math.round((salaryBalance + thirteenth + vacation + fgts + noticeIndemnity) * 100) / 100;
    return {
      id: rid('resign'), freelancerId: h.id, name: h.name, role: h.role, salary: h.salary,
      hiredDay: h.hiredDay, absDay: this.absDay,
      salaryBalance, thirteenth, vacation, fgts, noticeIndemnity, total,
      type: 'resign',
    };
  }
  /** aluga sala trancada: entrada à vista + mensalidade dia 10 */
  rentRoom(roomId: string): string {
    if (!ROOM_RENT.rooms.includes(roomId)) return 'sala não alugável';
    if (this.ownedRooms.includes(roomId)) return 'sala já alugada';
    if (this.balance < ROOM_RENT.entry) return 'saldo insuficiente p/ entrada';
    this.balance = Math.round((this.balance - ROOM_RENT.entry) * 100) / 100;
    this.ownedRooms.push(roomId);
    this.bills.push({ id: `rent-${roomId}`, name: `Aluguel sala ${roomId}`, amount: ROOM_RENT.monthly, dueDay: 10, paidMonth: 0, lateFee: 0 });
    this.push(`🏢 Sala ${roomId} alugada! Entrada ${brl(ROOM_RENT.entry)} + ${brl(ROOM_RENT.monthly)}/mês (dia 10).`);
    this.notify(`🏢 Sala ${roomId} liberada! Mensalidade de ${brl(ROOM_RENT.monthly)} dia 10.`);
    this.changed = true;
    return 'ok';
  }
  /** sala de RH (onde pedidos esperam resposta) */
  setRhRoom(roomId: string): string {
    if (!ROOM_IDS_ALL.includes(roomId)) return 'sala inválida';
    if (!this.ownedRooms.includes(roomId)) return 'sala trancada — alugue primeiro';
    this.rhRoom = roomId;
    this.push(`🏢 Sala de RH: ${roomId}. Pedidos de aumento/demissão esperam lá.`);
    this.changed = true;
    return 'ok';
  }
  raise(id: string, accept: boolean): string {
    const i = this.requests.findIndex((r) => r.id === id);
    if (i < 0) return 'solicitação inválida';
    const [r] = this.requests.splice(i, 1);
    const h = this.hired.find((x) => x.id === r.freelancerId);
    if (!h) return 'freelancer saiu';
    h.waitingRH = null; // respondeu: sai do RH
    if (r.type === 'resign') {
      // pedido de demissão: paga acerto e remove
      if (!accept) {
        this.push(`Demissão de ${h.name} recusada — continua trabalhando.`);
      } else {
        const cost = r.total;
        if (this.balance < cost) return 'saldo insuficiente para acerto';
        this.balance = Math.round((this.balance - cost) * 100) / 100;
        this.hired = this.hired.filter((x) => x.id !== h.id);
        this.push(`📝 ${h.name} demitido a pedido. Acerto pago: ${brl(cost)}.`);
        this.notify(`📝 ${h.name} saiu. Acerto de ${brl(cost)} pago.`);
      }
      this.changed = true;
      return 'ok';
    }
    // raise request
    if (r.type !== 'raise') return 'tipo inválido';
    // próxima solicitação do mesmo dev só após 20 dias (nunca 2 pendentes: geração já bloqueia)
    h.askDay = this.absDay + 20;
    if (!accept) {
      // negou: 35% de chance de pedir demissão (vai ao RH de novo)
      if (Math.random() < 0.35) {
        const rr = this.makeResignRequest(h);
        this.requests.push(rr);
        h.waitingRH = 'resign';
        this.push(`😠 ${h.name} não gostou da negativa e pediu demissão! Acerto: ${brl(rr.total)}.`);
        this.notify(`😠 ${h.name} pediu demissão após negativa!`);
      } else {
        this.push(`Aumento de ${h.name} recusado — aceitou e voltou ao trabalho.`);
      }
    } else {
      h.level = r.toLevel;
      h.salary = r.newSalary;
      h.lph = LEVEL_INFO[r.toLevel].lph;
      // ponytail: sem reset de hiredDay — reset farma pedido novo em 14d
      this.push(`${h.name} agora é ${r.toLevel} (${brl(r.newSalary)}/mês).`);
    }
    this.changed = true;
    return 'ok';
  }
  paySalary(id: string): string {
    const h = this.hired.find((x) => x.id === id);
    if (!h) return 'freelancer inválido';
    if (h.lastPaidMonth === this.month) return 'já pago este mês';
    if (this.balance < h.salary) return 'saldo insuficiente';
    this.balance = Math.round((this.balance - h.salary) * 100) / 100;
    h.lastPaidMonth = this.month;
    this.push(`Salário de ${h.name} pago: ${brl(h.salary)} (manual).`);
    this.changed = true;
    return 'ok';
  }
  payDebt(id: string): string {
    const i = this.debts.findIndex((d) => d.id === id);
    if (i < 0) return 'dívida inválida';
    const d = this.debts[i];
    if (this.balance < d.amount) return 'saldo insuficiente';
    this.balance = Math.round((this.balance - d.amount) * 100) / 100;
    this.debts.splice(i, 1);
    this.push(`Dívida com ${d.who} quitada: ${brl(d.amount)}.`);
    this.changed = true;
    return 'ok';
  }
  payBill(id: string): string {
    const b = this.bills.find((x) => x.id === id);
    if (!b) return 'conta inválida';
    if (b.paidMonth === this.month) return 'já paga este mês';
    const total = b.amount + b.lateFee;
    if (this.balance < total) return 'saldo insuficiente';
    this.balance = Math.round((this.balance - total) * 100) / 100;
    b.paidMonth = this.month;
    b.lateFee = 0;
    this.push(`${b.name} paga: ${brl(total)} (manual).`);
    this.changed = true;
    return 'ok';
  }
  work(playerId: string, projectId: string | null, user = '?') {
    if (projectId === null) this.workBeats.delete(playerId);
    else this.workBeats.set(playerId, { projectId, at: Date.now(), name: user });
  }
  dropPlayer(playerId: string) {
    this.workBeats.delete(playerId);
    for (const [box, cl] of Object.entries(this.claims))
      if (cl.playerId === playerId) delete this.claims[box];
  }
  /** compra o carrinho: aparece no spawn, leva 3 caixas (-40% vel, sem pulo) */
  buyDolly(): string {
    if (this.dollyOwned) return 'já tem carrinho';
    if (this.balance < DOLLY_PRICE) return 'saldo insuficiente';
    this.balance = Math.round((this.balance - DOLLY_PRICE) * 100) / 100;
    this.dollyOwned = true;
    this.push(`🛒 Carrinho comprado (${brl(DOLLY_PRICE)}). Está no spawn.`);
    this.notify('🛒 Carrinho no spawn! Pegue com E, leva 3 caixas.');
    this.changed = true;
    return 'ok';
  }
  /** posição onde o jogador largou o carrinho (só guarda; visual é do cliente) */
  setDollyPos(x: number, z: number): string {
    if (!this.dollyOwned) return 'sem carrinho';
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 'posição inválida';
    this.dollyPos = {
      x: Math.min(23, Math.max(-23, Math.round(x * 100) / 100)),
      z: Math.min(18, Math.max(-41, Math.round(z * 100) / 100)),
    };
    this.changed = true;
    return 'ok';
  }
  /** compra notebook do tier: chega em 1 dia de jogo como caixa no spawn */
  buyNotebook(tier: PcTier = 'basico'): string {
    const t = PC_TIERS[tier] ?? PC_TIERS.basico;
    if (this.balance < t.price) return 'saldo insuficiente';
    this.balance = Math.round((this.balance - t.price) * 100) / 100;
    this.deliveries.push({ id: rid('box'), arrivesAbsMin: this.absMinNow() + 1440, tier, price: t.price });
    this.push(`Notebook ${t.label} comprado (${brl(t.price)}). Chega em 1 dia no spawn.`);
    this.changed = true;
    return 'ok';
  }
  claimBox(boxId: string, playerId: string, user: string): string {
    if (!this.packages.some((p) => p.id === boxId)) return 'caixa inválida';
    const cl = this.claims[boxId];
    if (cl && cl.playerId !== playerId) return 'outro jogador pegou';
    this.claims[boxId] = { playerId, name: user };
    this.changed = true;
    return 'ok';
  }
  /** larga a caixa no chão onde está (dá p/ pegar de novo; etiqueta mostra o que é) */
  dropBox(boxId: string, x: number, z: number, playerId: string): string {
    const cl = this.claims[boxId];
    if (!cl || cl.playerId !== playerId) return 'pegue a caixa primeiro';
    const p = this.packages.find((q) => q.id === boxId);
    if (!p) return 'caixa inválida';
    p.x = Math.round(Math.max(-23, Math.min(23, x)) * 10) / 10;
    p.z = Math.round(Math.max(-41, Math.min(18, z)) * 10) / 10;
    delete this.claims[boxId];
    this.push(`📦 ${cl.name} largou a caixa.`);
    this.changed = true;
    return 'ok';
  }
  placeBox(boxId: string, station: number | null, room: string | null, playerId: string): string {
    const cl = this.claims[boxId];
    if (!cl || cl.playerId !== playerId) return 'pegue a caixa primeiro';
    if (!this.packages.some((p) => p.id === boxId)) return 'caixa inválida';
    const hasStation = station !== null && station !== undefined;
    const hasRoom = !!room;
    if (hasStation === hasRoom) return 'escolha estação OU sala';
    if (hasStation) {
      if (station! < 0 || station! >= DEV_STATIONS) return 'estação inválida';
      if (this.machines.some((m) => m.where === `st:${station}`)) return 'estação já tem máquina';
    } else {
      if (!['W1', 'W2', 'W3', 'E1', 'E2', 'E3'].includes(room!)) return 'sala inválida';
      if (!this.ownedRooms.includes(room!)) return 'sala trancada — alugue primeiro';
      if (this.machines.some((m) => m.where === `rm:${room}`)) return 'sala já tem máquina';
    }
    const existing = this.machines.find((m) => m.id === boxId);
    const pkg = this.packages.find((p) => p.id === boxId);
    if (existing) {
      existing.where = hasStation ? `st:${station}` : `rm:${room}`;
      existing.broken = false;
    } else {
      this.machines.push({ id: boxId, where: hasStation ? `st:${station}` : `rm:${room}`, broken: false, tier: pkg?.tier ?? 'basico', price: pkg?.price ?? PC_TIERS.basico.price });
    }
    this.packages = this.packages.filter((p) => p.id !== boxId);
    delete this.claims[boxId];
    this.push(
      hasStation
        ? `Máquina instalada na estação ${station! + 1} (${cl.name}).`
        : `Máquina instalada na sala ${room} (${cl.name}).`,
    );
    this.notify(hasStation ? `💻 Estação ${station! + 1} com máquina nova!` : `💻 Sala ${room} com computador novo!`);
    this.changed = true;
    return 'ok';
  }
  /** desinstala: técnico vem buscar, sai com a caixa e paga 10% de sucata */
  uninstallMachine(id: string): string {
    const m = this.machines.find((x) => x.id === id);
    if (!m) return 'máquina inválida';
    if (m.where === 'box') return 'já está na caixa';
    if (this.techs.some((t) => t.machineId === id)) return 'técnico já a caminho';
    const from = m.where.startsWith('st:') ? `estação ${Number(m.where.slice(3)) + 1}` : `sala ${m.where.slice(3)}`;
    m.from = from;
    const now = this.absMinNow();
    const name = `Téc. ${this.uniqueName(NAMES_FIRST, NAMES_LAST)}`;
    const scrap = Math.round(((m.price ?? PC_TIERS[m.tier ?? 'basico']?.price ?? 3500) * 0.1) * 100) / 100;
    this.techs.push({ id: rid('tech'), name, machineId: id, where: m.where, state: 'collecting', arriveAbsMin: now + 60, fixAbsMin: now + 180, scrap });
    this.push(`📦 ${name} chamado para buscar a máquina (${from}). Sucata: +${brl(scrap)}.`);
    this.notify(`📦 Técnico a caminho para buscar a máquina!`);
    this.changed = true;
    return 'ok';
  }
  repairMachine(id: string): string {
    const m = this.machines.find((x) => x.id === id);
    if (!m) return 'máquina inválida';
    if (!m.broken) return 'já funciona';
    if (m.where === 'box') return 'instale a máquina primeiro';
    if (this.techs.some((t) => t.machineId === id)) return 'técnico já a caminho';
    if (this.balance < REPAIR_PRICE) return 'saldo insuficiente';
    this.balance = Math.round((this.balance - REPAIR_PRICE) * 100) / 100;
    const now = this.absMinNow();
    const name = `Téc. ${this.uniqueName(NAMES_FIRST, NAMES_LAST)}`;
    this.techs.push({ id: rid('tech'), name, machineId: id, where: m.where, state: 'toMachine', arriveAbsMin: now + 60, fixAbsMin: now + 180 });
    this.push(`🔧 ${name} chamado para consertar (${brl(REPAIR_PRICE)}). Chega em ~1h, conserta em ~3h.`);
    this.notify(`🔧 Técnico a caminho!`);
    this.changed = true;
    return 'ok';
  }
  deliver(id: string): string {
    return this.deliverImpl(id, false);
  }
  deliverImpl(id: string, forceNoChilique: boolean): string {
    const p = this.projects.find((x) => x.id === id && x.status === 'active');
    if (!p) return 'projeto inválido';
    if (p.linesDone < p.linesTotal) return 'projeto incompleto';
    const rest = Math.round((p.value - p.received) * 100) / 100;
    const lateDays = Math.max(0, this.absDay - p.dueAbs);
    // chilique: cliente some sem pagar o restante e exige o sinal de volta
    if (!forceNoChilique && Math.random() < CHILIQUE_CHANCE) {
      const entry = p.received;
      this.balance = Math.round((this.balance - entry) * 100) / 100;
      p.received = 0;
      p.status = 'delivered';
      for (const h of this.hired) if (h.projectId === id) h.projectId = null;
      this.push(`😡 ${p.client} deu chilique: não pagou e exigiu ${brl(entry)} de volta!`);
      this.notify(`😡 Chilique! ${p.client} não pagou e levou ${brl(entry)} de volta.`);
      this.changed = true;
      return 'ok';
    }
    const penalty = Math.min(rest, Math.round(rest * LATE_PENALTY_DAY * lateDays * 100) / 100);
    const paid = Math.round((rest - penalty) * 100) / 100;
    this.balance = Math.round((this.balance + paid) * 100) / 100;
    this.monthRevenue += p.value; // faturamento para Simples
    p.status = 'delivered';
    p.received = p.value;
    for (const h of this.hired) if (h.projectId === id) h.projectId = null;
    this.push(
      lateDays > 0
        ? `${p.title} entregue com ${lateDays}d de atraso (-${brl(penalty)}): +${brl(paid)}.`
        : `${p.title} entregue a ${p.client} (+${brl(paid)}).`,
    );
    this.changed = true;
    return 'ok';
  }
  /** estado serializável (arquivo e snapshot de sala usam o mesmo formato) */
  serialize() {
    return {
      minute: this.minute, day: this.day, month: this.month, absDay: this.absDay,
      balance: this.balance, monthRevenue: this.monthRevenue, ticket: this.ticket, serving: this.serving,
      bots: this.bots, projects: this.projects, candidates: this.candidates,
      hired: this.hired, debts: this.debts, requests: this.requests, notifs: this.notifs,
          pendingFines: this.pendingFines, manualPause: this.manualPause, dollyOwned: this.dollyOwned,
          dollyPos: this.dollyPos, rhRoom: this.rhRoom, ownedRooms: this.ownedRooms,
      machines: this.machines, deliveries: this.deliveries, packages: this.packages,
      techs: this.techs,
      bills: this.bills, log: this.log,
    };
  }
  save() {
    try {
      mkdirSync(dirname(SAVE_PATH), { recursive: true });
      writeFileSync(SAVE_PATH, JSON.stringify(this.serialize()));
    } catch {
      /* disco indisponível: segue em memória */
    }
  }
  load() {
    try {
      const raw = readFileSync(SAVE_PATH, 'utf8');
      this.restore(JSON.parse(raw));
      console.info('[company] estado restaurado de data/company.json');
    } catch {
      this.genCandidates(3);
      this.machines.push({ id: rid('pc'), where: 'rm:W1', broken: false });
    }
  }
  /** restaura de um snapshot (arquivo ou sala); zera transitórios (chamados, claims) */
  restore(data: unknown) {
    {
      const s = data as Partial<CompanySim>;
      for (const k of [
        'minute', 'day', 'month', 'absDay', 'balance', 'monthRevenue', 'ticket', 'serving',
        'bots', 'projects', 'candidates', 'hired', 'debts', 'requests', 'notifs',
        'pendingFines', 'manualPause', 'dollyOwned', 'dollyPos', 'rhRoom', 'ownedRooms', 'machines', 'deliveries', 'packages', 'techs', 'bills', 'log',
      ] as const) {
        if (s[k] !== undefined) (this as unknown as Record<string, unknown>)[k] = s[k];
      }
      // migração: saves antigos ganham W1+E1 abertas
      if (!Array.isArray(this.ownedRooms) || !this.ownedRooms.length) this.ownedRooms = ['W1', 'E1'];
      if (this.rhRoom && !this.ownedRooms.includes(this.rhRoom)) this.rhRoom = 'W1';
      if (this.dollyPos && (!Number.isFinite(this.dollyPos.x) || !Number.isFinite(this.dollyPos.z)))
        this.dollyPos = null;
      this.techs ??= [];
      // migração de saves antigos: preenche campos novos para nada travar
      const DEFAULT_BILLS: Bill[] = [
        { id: 'aluguel', name: 'Aluguel escritório', amount: 8000, dueDay: 10, paidMonth: 0, lateFee: 0 },
        { id: 'energia', name: 'Energia', amount: 1200, dueDay: 10, paidMonth: 0, lateFee: 0 },
        { id: 'agua', name: 'Água', amount: 400, dueDay: 10, paidMonth: 0, lateFee: 0 },
        { id: 'internet', name: 'Internet', amount: 600, dueDay: 10, paidMonth: 0, lateFee: 0 },
        { id: 'gov', name: 'Taxas governo', amount: 1500, dueDay: 10, paidMonth: 0, lateFee: 0 },
      ];
      for (const def of DEFAULT_BILLS)
        if (!this.bills.some((b) => b.id === def.id)) this.bills.push({ ...def });
      for (const p of this.projects) {
        p.linesTotal ??= 3000;
        p.linesDone ??= 0;
        p.dueAbs ??= this.absDay + 5;
      }
      for (const h of this.hired) {
        h.calledBy = null; // chamado não sobrevive a reload
        h.waitingRH ??= null;
        h.hiredDay ??= this.absDay;
        h.askDay ??= this.absDay;
        h.lastPaidMonth ??= this.month;
        h.projectId ??= null;
        h.role ??= 'dev';
        h.post ??= null;
        (h as { lastCall?: number }).lastCall ??= 0;
        h.atWork ??= false;
        h.workState ??= 'off';
        h.thirteenthAccrued ??= 0;
        h.vacationAccrued ??= 0;
        if (h.role === 'manager') {
          // gerente sempre no computador 1 da sala de devs (E1, estação 1)
          const st = this.devStationForHire('manager');
          h.stationX = st.x;
          h.stationZ = st.z;
          h.stationRy = st.ry;
        } else if (h.stationX === undefined || h.stationZ === undefined || h.stationRy === undefined) {
          const st = this.devStationForHire(h.role);
          h.stationX = st.x;
          h.stationZ = st.z;
          h.stationRy = st.ry;
        }
      }
      for (const c of this.candidates) c.role ??= 'dev';
      // garante que existam candidatos (incluindo gerente) após carregar save
      if (this.candidates.length === 0) {
        this.genCandidates(3);
      } else if (!this.candidates.some((c) => c.role === 'manager') && !this.hired.some((h) => h.role === 'manager')) {
        const salary = Math.round((3500 + Math.random() * 1500) / 100) * 100;
        this.candidates.push({ id: rid('cand'), name: this.uniqueName(FREELA_FIRST, NAMES_LAST), level: 'junior', salary, lph: 0, role: 'manager' });
        this.changed = true;
      }
      this.requests ??= [];
      this.notifs ??= [];
      this.pendingFines ??= [];
      this.machines ??= [];
      for (const m of this.machines) {
        m.tier ??= 'basico';
        m.price ??= PC_TIERS[m.tier]?.price ?? 3500;
        m.useHours ??= 0;
      }
      for (const d of this.deliveries ?? []) {
        d.tier ??= 'basico';
        d.price ??= PC_TIERS[d.tier]?.price ?? 3500;
      }
      for (const p of this.packages ?? []) {
        p.tier ??= 'basico';
        p.price ??= PC_TIERS[p.tier]?.price ?? 3500;
      }
      // migração: stations boolean[] antigas viram máquinas
      const oldStations = (s as unknown as { stations?: unknown }).stations;
      if (Array.isArray(oldStations)) {
        oldStations.forEach((on: unknown, i: number) => {
          if (on && !this.machines.some((m) => m.where === `st:${i}`))
            this.machines.push({ id: rid('pc'), where: `st:${i}`, broken: false });
        });
      }
      // W1 vem com computador de fábrica; demais salas precisam comprar
      if (!this.machines.some((m) => m.where.startsWith('rm:')))
        this.machines.push({ id: rid('pc'), where: 'rm:W1', broken: false });
      this.deliveries ??= [];
      this.packages ??= [];
      // transitórios nunca sobrevivem a reload/hibernação (ninguém online p/ segurar)
      this.claims = {};
      this.workBeats.clear();
      this.debts ??= [];
      this.candidates ??= [];
    }
  }
}

export const company = new CompanySim();
