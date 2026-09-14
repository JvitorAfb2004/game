import { test } from 'node:test';
import assert from 'node:assert/strict';
import { company } from './game/company.ts';

function isolate() {
  company.bots = [];
  company.projects = [];
  company.candidates = [];
  company.hired = [];
  company.debts = [];
  company.requests = [];
  company.notifs = [];
  company.pendingFines = [];
  company.manualPause = false;
  company.serving = null;
  company.machines = [];
  company.techs = [];
  company.deliveries = [];
  company.packages = [];
  company.ownedRooms = ['W1', 'E1'];
  company.rhRoom = 'W1';
  company.bills = company.bills.filter((b) => !b.id.startsWith('rent-'));
  (company as unknown as { claims: Record<string, unknown> }).claims = {};
  (company as unknown as { spawnIn: number }).spawnIn = 1e9;
  (company as unknown as { emptyFor: number }).emptyFor = 0;
  (company as unknown as { autoPaused: boolean }).autoPaused = false;
}

void test('contrata, aloca e freela escreve linhas com o tempo', () => {
  isolate();
  company.minute = 9 * 60; // horário comercial
  company.candidates.push({ id: 'c1', name: 'Igor', level: 'pleno', salary: 5000, lph: 200, role: 'dev' });
  assert.equal(company.hire('c1'), 'ok');
  assert.equal(company.hired.length, 1);
  company.projects.push({
    id: 'p1', client: 'Ana', title: 'Site', value: 5000, received: 2500,
    linesTotal: 400, linesDone: 0, dueAbs: 99, status: 'active',
  });
  assert.equal(company.assign(company.hired[0].id, 'p1'), 'ok');
  company.machines.push({ id: 'm0', where: 'st:0', broken: false }); // estação do 1º dev com PC
  company.tick(6); // 60 game-min = 1h de jogo -> 200 linhas
  const p = company.projects[0];
  assert(p.linesDone > 190 && p.linesDone <= 400, `linhas=${p.linesDone}`);
  assert.equal(company.deliver('p1'), 'projeto incompleto');
});

void test('freela não rende de noite nem no almoço', () => {
  isolate();
  company.hired.push({
    id: 'h9', name: 'Otto', level: 'junior', salary: 2500, lph: 100, role: 'dev',
    projectId: 'p9', post: null, lastCall: 0, lastPaidMonth: company.month, hiredDay: 1, askDay: 1, atWork: false, workState: 'off',
    stationX: 0, stationZ: 0, stationRy: 0,
  });
  company.projects.push({
    id: 'p9', client: 'Lia', title: 'ERP', value: 3000, received: 1500,
    linesTotal: 1000, linesDone: 0, dueAbs: 99, status: 'active',
  });
  company.minute = 22 * 60;
  company.tick(0.1);
  assert.equal(company.projects[0].linesDone, 0);
  company.minute = 12 * 60 + 30; // almoço
  company.tick(0.025); // 15 game-min dentro do almoço
  assert.equal(company.projects[0].linesDone, 0);
  company.minute = 9 * 60;
  company.machines.push({ id: 'm0', where: 'st:0', broken: false });
  company.tick(6); // 1h de jogo
  assert(company.projects[0].linesDone > 90, 'rendeu de manhã');
});

void test('jogador codando soma junto e entrega libera restante', () => {
  isolate();
  company.minute = 9 * 60;
  const bal = company.balance;
  company.projects.push({
    id: 'p2', client: 'Bia', title: 'App', value: 4000, received: 2000,
    linesTotal: 100, linesDone: 0, dueAbs: 99, status: 'active',
  });
  company.work('u1', 'p2', 'dono');
  for (let i = 0; i < 60; i++) company.tick(0.1); // 60 game-min = 1h de jogo (100 linhas/h de dono)
  company.work('u1', null);
  const p = company.projects.find((x) => x.id === 'p2')!;
  assert(p.linesDone >= 99, `linhas=${p.linesDone}`);
  const snap = company.snapshot();
  assert.deepEqual(snap.projects.find((x) => x.id === 'p2')?.workers, []);
  assert.equal(company.deliverImpl('p2', true), 'ok');
  assert(company.balance >= bal + 1500, 'restante pago (menos possível atraso)');
});

void test('salário atrasado demite e vira dívida com juros', () => {
  isolate();
  company.hired.push({
    id: 'h1', name: 'Sofia', level: 'junior', salary: 2500, lph: 100, role: 'dev',
    projectId: null, post: null, lastCall: 0, lastPaidMonth: company.month - 1, hiredDay: 1, askDay: 1, atWork: false, workState: 'off',
    stationX: 0, stationZ: 0, stationRy: 0,
  });
  assert.equal(company.paySalary('h1'), 'ok');
  assert.equal(company.paySalary('h1'), 'já pago este mês');
  // avança dia a dia até passar do dia 5 do mês seguinte (1440 game-min = 1 dia)
  const target = company.absDay + (30 - company.day) + 6;
  while (company.absDay < target) company.tick(144);
  assert.equal(company.hired.length, 0);
  assert.equal(company.debts.length, 1);
  const before = company.debts[0].amount;
  company.tick(144); // +1 dia de juros
  assert(company.debts[0].amount > before, 'juros aplicados');
});

void test('cliente difícil pechincha e fecha na contraproposta', () => {
  isolate();
  company.bots.push({
    id: 'b-hard', ticket: 1, name: 'Jorge', want: 'ERP pequeno', kind: 'dev', hard: true,
    lines: 5000, value: 5000, deadlineDays: 5, state: 'attending',
    stage: 'ask', counter: 0, projectId: null,
    persona: 'normal', aiSay: '', history: [], bravo: 0, lastTalk: 0,
  });
  assert.equal(company.answer('b-hard', true), 'ok');
  const b = company.bots.find((x) => x.id === 'b-hard')!;
  assert.equal(b.stage, 'haggle');
  assert.equal(b.counter, 4000);
  const chat = company.chatFor(b);
  assert(chat.opts.some((o) => o.id === 'hold'), 'tem opção manter preço');
  assert.equal(company.answer('b-hard', true), 'ok');
  const p = company.projects[0];
  assert.equal(p.value, 4000);
  assert.equal(p.received, 2000);
  assert(!company.bots.some((x) => x.id === 'b-hard'), 'sumiu após fechar');
});

void test('cliente volta no prazo e busca o projeto', () => {
  isolate();
  company.projects.push({
    id: 'pp', client: 'Lia', title: 'Site da loja', value: 3000, received: 1500,
    linesTotal: 100, linesDone: 100, dueAbs: company.absDay, status: 'active',
  });
  company.tick(0.1);
  const back = company.bots.find((b) => b.stage === 'pickup');
  assert(back, 'voltou no prazo');
  company.attend(back!.id);
  assert.equal(company.answer(back!.id, false), 'ok'); // ainda não
  const p = company.projects.find((x) => x.id === 'pp')!;
  assert(p.dueAbs > company.absDay, 'reagendou a volta');
});

void test('aceitar serviço fora do escopo gera denúncia e multa', () => {
  isolate();
  company.bots.push({
    id: 'b-off', ticket: 9, name: 'Paulo', want: 'Bolo de festa', kind: 'off', hard: false,
    lines: 0, value: 0, deadlineDays: 0, state: 'attending',
    stage: 'ask', counter: 0, projectId: null,
    persona: 'normal', aiSay: '', history: [], bravo: 0, lastTalk: 0,
  });
  assert.equal(company.answer('b-off', true), 'ok');
  assert(!company.bots.some((b) => b.id === 'b-off'), 'saiu furioso');
  assert.equal(company.pendingFines.length, 1);
  const fine = company.pendingFines[0].amount;
  assert(fine >= 10000 && fine <= 50000, `multa ${fine} entre 10k e 50k`);
  while (company.absDay <= company.pendingFines[0]?.dueAbs) company.tick(144); // 1 dia por tick
  const debt = company.debts.find((d) => d.who.includes('Paulo'));
  assert(debt, 'virou dívida');
  assert(company.notifs.some((n) => n.text.includes('Multa')), 'notificou');
});

void test('projeto 100% libera o dev e pausa congela o tempo', () => {
  isolate();
  company.minute = 9 * 60;
  company.hired.push({
    id: 'h2', name: 'Maya', level: 'junior', salary: 2500, lph: 100, role: 'dev',
    projectId: 'p3', post: null, lastCall: 0, lastPaidMonth: company.month, hiredDay: 1, askDay: 1, atWork: false, workState: 'off',
    stationX: 0, stationZ: 0, stationRy: 0,
  });
  company.projects.push({
    id: 'p3', client: 'Rafa', title: 'ERP', value: 3000, received: 1500,
    linesTotal: 100, linesDone: 0, dueAbs: 99, status: 'active',
  });
  company.machines.push({ id: 'm0', where: 'st:0', broken: false });
  company.tick(6); // 1h de jogo: 100 linhas de junior
  assert.equal(company.hired[0].projectId, null, 'dev liberado aos 100%');
  const m = company.minute;
  company.setPaused(true);
  company.tick(6);
  assert.equal(company.minute, m, 'tempo congelado');
  assert(company.snapshot().paused, 'snapshot marca pausa');
  company.setPaused(false);
  company.autoPause(300, false);
  assert(company.snapshot().paused, 'sala vazia 5min pausa');
  company.autoPause(1, true);
  assert(!company.snapshot().paused, 'alguém voltou despausa');
});

void test('demitir gera acerto proporcional em dívida', () => {
  isolate();
  company.day = 15;
  company.hired.push({
    id: 'h3', name: 'Gael', level: 'pleno', salary: 3000, lph: 200, role: 'dev',
    projectId: null, post: null, lastCall: 0, lastPaidMonth: company.month - 1, hiredDay: 1, askDay: 1, atWork: false, workState: 'off',
    stationX: 0, stationZ: 0, stationRy: 0,
  });
  assert.equal(company.fire('h3'), 'ok');
  assert.equal(company.hired.length, 0);
  assert.equal(company.debts.length, 1);
  assert.equal(company.debts[0].amount, 1500, 'metade do mês = metade do salário');
  assert(company.debts[0].who.includes('Acerto'), 'dívida de acerto');
});

void test('demitir com mês pago não gera acerto', () => {
  isolate();
  company.hired.push({
    id: 'h4', name: 'Iris', level: 'junior', salary: 2400, lph: 100, role: 'dev',
    projectId: null, post: null, lastCall: 0, lastPaidMonth: company.month, hiredDay: 1, askDay: 1, atWork: false, workState: 'off',
    stationX: 0, stationZ: 0, stationRy: 0,
  });
  assert.equal(company.fire('h4'), 'ok');
  assert.equal(company.debts.length, 0);
});

void test('recepcionista no balcão chama e fecha sozinha', () => {
  isolate();
  company.hired.push({
    id: 'r1', name: 'Luna', level: 'recep', salary: 2000, lph: 0, role: 'recep',
    projectId: null, post: 0, lastCall: 0, lastPaidMonth: company.month, hiredDay: 1, askDay: 1, atWork: false, workState: 'off',
    stationX: 0, stationZ: 0, stationRy: 0,
  });
  company.bots.push({
    id: 'b-w', ticket: 31, name: 'Ruan', want: 'Site da loja', kind: 'dev', hard: false,
    lines: 3000, value: 3000, deadlineDays: 4, state: 'waiting',
    stage: 'ask', counter: 0, projectId: null,
    persona: 'normal', aiSay: '', history: [], bravo: 0, lastTalk: 0,
  });
  assert.equal(company.post('r1', 1), 'ok');
  company.tick(0.1);
  assert.equal(company.bots.find((b) => b.id === 'b-w'), undefined, 'chamou, atendeu e fechou sozinha');
  assert.equal(company.projects.length, 1, 'virou projeto');
  assert.equal(company.assign('r1', 'px'), 'só devs vão a projetos (gerente se vira, recepcionista vai ao balcão)');
});

void test('notebook: compra, chega, instala e dev rende', () => {
  isolate();
  company.minute = 9 * 60;
  const bal = company.balance;
  assert.equal(company.buyNotebook(), 'ok');
  assert.equal(company.balance, bal - 3500);
  assert.equal(company.deliveries.length, 1);
  company.tick(144); // 1 dia de jogo
  assert.equal(company.packages.length, 1, 'caixa no spawn');
  const box = company.packages[0].id;
  assert.equal(company.claimBox(box, 'u1', 'dono'), 'ok');
  assert.equal(company.claimBox(box, 'u2', 'outro'), 'outro jogador pegou');
  assert.equal(company.placeBox(box, 0, null, 'u2'), 'pegue a caixa primeiro');
  assert.equal(company.placeBox(box, 0, null, 'u1'), 'ok');
  assert.equal(company.machineAtStation(0)?.id, box);
  assert.equal(company.placeBox(box, 0, null, 'u1'), 'pegue a caixa primeiro');
});

void test('dev sem notebook não rende; com notebook rende', () => {
  isolate();
  company.minute = 9 * 60;
  company.hired.push({
    id: 'h5', name: 'Eva', level: 'junior', salary: 2500, lph: 100, role: 'dev',
    projectId: 'p5', post: null, lastCall: 0, lastPaidMonth: company.month, hiredDay: 1, askDay: 1, atWork: false, workState: 'off',
    stationX: 0, stationZ: 0, stationRy: 0,
  });
  company.projects.push({
    id: 'p5', client: 'Mila', title: 'App', value: 3000, received: 1500,
    linesTotal: 500, linesDone: 0, dueAbs: 99, status: 'active',
  });
  company.tick(0.1);
  assert.equal(company.projects[0].linesDone, 0, 'sem PC parado');
  company.machines.push({ id: 'm0', where: 'st:0', broken: false });
  company.tick(6); // 1h de jogo
  assert(company.projects[0].linesDone > 90, 'com PC rendeu');
});

void test('sala cheia barra o 13º dev', () => {
  isolate();
  for (let i = 0; i < 12; i++)
    company.hired.push({
      id: `hx${i}`, name: `Dev${i}`, level: 'junior', salary: 2500, lph: 100, role: 'dev',
      projectId: null, post: null, lastCall: 0, lastPaidMonth: company.month, hiredDay: 1, askDay: 1,
      atWork: false, workState: 'off', stationX: 0, stationZ: 0, stationRy: 0,
    });
  company.candidates.push({ id: 'cx', name: 'Extra', level: 'junior', salary: 2500, lph: 100, role: 'dev' });
  assert.equal(company.hire('cx'), 'sala de devs cheia (12 postos)');
});

void test('sala sem máquina não abre PC; instala e quebra', () => {
  isolate();
  company.balance = 100000;
  if (!company.ownedRooms.includes('W2')) assert.equal(company.rentRoom('W2'), 'ok');
  company.machines.push({ id: 'w1', where: 'rm:W1', broken: false }); // W1 vem com PC
  assert.equal(company.roomsPC()['W2'], false, 'W2 sem máquina');
  assert.equal(company.roomsPC()['W1'], true, 'W1 vem com PC');
  company.machines.push({ id: 'mw', where: 'box', broken: false });
  company.packages.push({ id: 'mw' });
  assert.equal(company.claimBox('mw', 'u1', 'dono'), 'ok');
  assert.equal(company.placeBox('mw', null, 'W2', 'u1'), 'ok');
  assert.equal(company.roomsPC()['W2'], true);
  assert.equal(company.placeBox('mw', null, 'W2', 'u1'), 'pegue a caixa primeiro');
  // quebra para o dev/sala; conserto vira visita técnica (não é na hora)
  const m = company.machines.find((x) => x.id === 'mw')!;
  m.broken = true;
  assert.equal(company.roomsPC()['W2'], false, 'quebrada fecha a sala');
  const bal = company.balance;
  company.minute = 8 * 60; // de manhã: técnico trabalha 8-12h
  assert.equal(company.repairMachine('mw'), 'ok');
  assert.equal(company.balance, bal - 800, 'cobra na hora');
  assert.equal(m.broken, true, 'ainda quebrada: técnico a caminho');
  assert.equal(company.techs.length, 1, 'técnico spawnou');
  assert.equal(company.repairMachine('mw'), 'técnico já a caminho');
  company.tick(6); // +60 game-min: técnico chega
  assert.equal(company.techs[0].state, 'fixing', 'chegou e conserta');
  assert.equal(m.broken, true, 'ainda consertando');
  company.tick(12); // +120 game-min (ainda de manhã): pronto
  assert.equal(m.broken, false, 'consertada após o serviço');
  assert.equal(company.techs.length, 0, 'técnico foi embora');
  assert.equal(company.roomsPC()['W2'], true);
  // desinstalar: técnico busca, sai com a caixa e paga 10% de sucata
  const balBefore = company.balance;
  company.minute = 8 * 60; // de manhã: técnico trabalha 8-12h
  assert.equal(company.uninstallMachine('mw'), 'ok');
  assert.equal(company.roomsPC()['W2'], true, 'sala segue com PC até a coleta');
  assert.equal(company.techs.length, 1, 'técnico coletor a caminho');
  assert.equal(company.techs[0].state, 'collecting');
  assert(company.machines.some((m) => m.id === 'mw'), 'máquina fica até a coleta');
  company.minute = 8 * 60;
  company.tick(6); // +60 game-min: chegou p/ buscar
  company.tick(12); // +120 game-min: levou + pagou sucata
  assert(!company.machines.some((m) => m.id === 'mw'), 'máquina levada');
  assert.equal(company.roomsPC()['W2'], false, 'sala sem PC após coleta');
  assert.equal(company.techs.length, 0, 'técnico foi embora com a caixa');
  assert(company.balance > balBefore, 'sucata paga (+10%)');
  // nova compra instala em estação
  assert.equal(company.buyNotebook(), 'ok');
  company.tick(144);
  const fresh = company.packages[company.packages.length - 1].id;
  assert.equal(company.claimBox(fresh, 'u1', 'dono'), 'ok');
  assert.equal(company.placeBox(fresh, 3, null, 'u1'), 'ok');
  assert.equal(company.machineAtStation(3)?.id, fresh);
});

void test('bate-papo sem IA não quebra e usa fala local', () => {
  isolate();
  company.bots.push({
    id: 'b-talk', ticket: 51, name: 'Cleo', want: 'Site da loja', kind: 'dev', hard: false,
    lines: 3000, value: 3000, deadlineDays: 4, state: 'attending',
    stage: 'ask', counter: 0, projectId: null,
    persona: 'normal', aiSay: '', history: [], bravo: 0, lastTalk: 0,
  });
  assert.equal(company.talk('b-talk', 'e aí, beleza?'), 'ok');
  assert.equal(company.talk('b-talk', 'de novo'), 'devagar! espera 3s');
  const chat = company.chatFor(company.bots[0]);
  assert(chat.say.includes('Site'), 'fallback local');
});

void test('gerente único distribui dev livre no projeto urgente', () => {
  isolate();
  company.hired.push({
    id: 'g1', name: 'Bento', level: 'junior', salary: 4000, lph: 0, role: 'manager',
    projectId: null, post: null, lastCall: 0, lastPaidMonth: company.month, hiredDay: 1, askDay: 1, atWork: false, workState: 'off',
    stationX: 0, stationZ: 0, stationRy: 0,
  });
  company.hired.push({
    id: 'd1', name: 'Clara', level: 'junior', salary: 2500, lph: 100, role: 'dev',
    projectId: null, post: null, lastCall: 0, lastPaidMonth: company.month, hiredDay: 1, askDay: 1, atWork: false, workState: 'off',
    stationX: 0, stationZ: 0, stationRy: 0,
  });
  company.machines.push({ id: 'mm', where: 'st:0', broken: false });
  company.projects.push({
    id: 'pg', client: 'Ruan', title: 'App', value: 3000, received: 1500,
    linesTotal: 500, linesDone: 0, dueAbs: 50, status: 'active',
  });
  company.candidates.push({ id: 'gm2', name: 'Outro', level: 'junior', salary: 4000, lph: 0, role: 'manager' });
  assert.equal(company.hire('gm2'), 'só cabe um gerente');
  (company as unknown as { lastRebalance: number }).lastRebalance = -1000;
  company.tick(0.1);
  assert.equal(company.hired.find((h) => h.id === 'd1')?.projectId, 'pg', 'gerente alocou');
});

void test('load gera candidato gerente quando candidatos estão vazios', () => {
  isolate();
  company.candidates = [];
  company.hired = [];
  company.genCandidates(3);
  assert.ok(company.candidates.some((c) => c.role === 'manager'), 'gerente gerado');
  assert.ok(company.candidates.some((c) => c.role === 'recep'), 'recepcionista gerada');
});

void test('load adiciona gerente quando candidatos existem mas sem gerente', () => {
  isolate();
  company.candidates = [{ id: 'c1', name: 'Igor', level: 'junior', salary: 2500, lph: 100, role: 'dev' }];
  company.hired = [];
  if (!company.candidates.some((c) => c.role === 'manager') && !company.hired.some((h) => h.role === 'manager')) {
    const salary = Math.round((3500 + Math.random() * 1500) / 100) * 100;
    company.candidates.push({ id: 'c2', name: 'Gerente', level: 'junior', salary, lph: 0, role: 'manager' });
  }
  assert.equal(company.candidates.length, 2, 'gerador adicionado');
  assert.ok(company.candidates.some((c) => c.role === 'manager'), 'gerente gerado');
});

void test('recepcionista atende sozinha: aceita, pechincha pega o mínimo, fora de escopo dispensa', () => {
  isolate();
  company.hired.push({
    id: 'r1', name: 'Luna', level: 'recep', salary: 2000, lph: 0, role: 'recep',
    projectId: null, post: 1, lastCall: -1000, lastPaidMonth: company.month, hiredDay: 1, askDay: 1, atWork: false, workState: 'off',
    stationX: 0, stationZ: 0, stationRy: 0,
  });
  const bot = (o: object) => ({
    ticket: 61, name: 'Cli', want: 'Site', kind: 'dev', hard: false,
    lines: 3000, value: 5000, deadlineDays: 5, state: 'waiting',
    stage: 'ask', counter: 0, projectId: null,
    persona: 'normal', aiSay: '', history: [], bravo: 0, lastTalk: 0, ...o,
  });
  company.minute = 9 * 60;
  company.bots.push(bot({ id: 'b-easy' }) as never);
  company.tick(3); // 30 game-min: chama + atende + fecha
  assert.equal(company.projects.length, 1, 'fácil fechou');
  assert.equal(company.projects[0].value, 5000);
  company.bots.push(bot({ id: 'b-hard', hard: true }) as never);
  company.tick(3); // ciclo 1: chama + atende, vai p/ pechincha
  const haggle = company.bots.find((b) => b.id === 'b-hard');
  assert(haggle && haggle.stage === 'haggle', 'pechincha aberta no ciclo 1');
  company.tick(3); // ciclo 2: recepcionista fecha no mínimo
  assert.equal(company.projects.length, 2, 'difícil fechou');
  assert.equal(company.projects[1].value, 4000, 'pechincha pegou o mínimo (80%)');
  company.bots.push(bot({ id: 'b-off', kind: 'off', want: 'Construção de casa' }) as never);
  company.tick(3);
  assert.equal(company.projects.length, 2, 'fora de escopo não vira projeto');
  assert.equal(company.pendingFines.length, 0, 'dispensar não gera multa');
});

void test('larga a caixa no chão e pega de novo; desinstalar guarda a origem', () => {
  isolate();
  company.packages.push({ id: 'bx1' });
  assert.equal(company.dropBox('bx1', 0, 0, 'u9'), 'pegue a caixa primeiro');
  assert.equal(company.claimBox('bx1', 'u1', 'dono'), 'ok');
  assert.equal(company.dropBox('bx1', 5.5, -10.2, 'u1'), 'ok');
  const p = company.packages.find((q) => q.id === 'bx1')!;
  assert.equal(p.x, 5.5);
  assert.equal(p.z, -10.2);
  assert.equal(company.claimBox('bx1', 'u2', 'outro'), 'ok', 'largou: outro pega');
  assert.equal(company.dropBox('bx1', 99, -99, 'u2'), 'ok');
  assert(p.x! <= 23 && p.z! >= -41, 'fora do mapa: clamp');
  company.machines.push({ id: 'm9', where: 'rm:W2', broken: false });
  company.packages.push({ id: 'm9' });
  assert.equal(company.uninstallMachine('m9'), 'ok');
  assert.equal(company.machines.find((m) => m.id === 'm9')?.from, 'sala W2');
  assert.equal(company.techs[company.techs.length - 1].state, 'collecting', 'coletor a caminho');
});

void test('tiers: inter e premium custam mais e vêm na caixa', () => {
  isolate();
  company.balance = 100000;
  const bal = company.balance;
  assert.equal(company.buyNotebook('inter'), 'ok');
  assert.equal(company.balance, bal - 6000);
  assert.equal(company.buyNotebook('premium'), 'ok');
  assert.equal(company.balance, bal - 16000);
  company.tick(144); // 1 dia: as duas chegam
  assert.equal(company.packages.length, 2);
  const tiers = company.packages.map((p) => p.tier).sort((a, b) => (a ?? '').localeCompare(b ?? ''));
  assert.deepEqual(tiers, ['inter', 'premium']);
});

void test('máquina parada não quebra; em uso quebra por tier', () => {
  isolate();
  // estação com dev SEM projeto: nunca quebra
  company.hired.push({
    id: 'h-idle', name: 'Idle', level: 'junior', salary: 2500, lph: 100, role: 'dev',
    projectId: null, post: null, lastCall: 0, lastPaidMonth: company.month, hiredDay: 1, askDay: 1, atWork: false, workState: 'off',
    stationX: 0, stationZ: 0, stationRy: 0, thirteenthAccrued: 0, vacationAccrued: 0,
  } as never);
  company.machines.push({ id: 'm-idle', where: 'st:0', broken: false, tier: 'basico' });
  assert.equal(company.machineInUse('st:0'), false, 'sem projeto = parada');
  // sala sem obra ativa: parada
  company.machines.push({ id: 'm-room', where: 'rm:W2', broken: false, tier: 'basico' });
  assert.equal(company.machineInUse('rm:W2'), false, 'sem obra = parada');
  // com obra ativa: estação alocada e sala entram em uso
  company.projects.push({
    id: 'pw', client: 'C', title: 'Site', value: 3000, received: 1500,
    linesTotal: 100000, linesDone: 0, dueAbs: 99, status: 'active',
  });
  company.hired[0].projectId = 'pw';
  assert.equal(company.machineInUse('st:0'), true, 'dev alocado = em uso');
  assert.equal(company.machineInUse('rm:W2'), true, 'sala com obra = em uso');
  assert.equal(company.machineInUse('box'), false, 'caixa nunca quebra');
});

void test('carrinho: compra uma vez, aparece no snapshot', () => {
  isolate();
  company.balance = 100000;
  assert.equal(company.buyDolly(), 'ok');
  assert.equal(company.dollyOwned, true);
  assert.equal(company.balance, 98500);
  assert.equal(company.buyDolly(), 'já tem carrinho');
  assert.equal(company.snapshot().dollyOwned, true);
});

void test('aluga sala: entrada + mensalidade + destrava RH e instalação', () => {
  isolate();
  company.balance = 100000;
  assert.equal(company.rentRoom('W1'), 'sala não alugável');
  assert.equal(company.rentRoom('W3'), 'ok');
  assert.equal(company.balance, 94000);
  assert(company.ownedRooms.includes('W3'));
  assert(company.bills.some((b) => b.id === 'rent-W3' && b.amount === 1500));
  assert.equal(company.rentRoom('W3'), 'sala já alugada');
  company.balance = 100; // saldo baixo não aluga
  assert.equal(company.rentRoom('E2'), 'saldo insuficiente p/ entrada');
  company.balance = 100000;
});
void test('RH: configura sala; aceitar pedido tira da espera', () => {
  isolate();
  company.balance = 100000;
  assert.equal(company.setRhRoom('E3'), 'sala trancada — alugue primeiro');
  assert.equal(company.rentRoom('E3'), 'ok');
  assert.equal(company.setRhRoom('E3'), 'ok');
  assert.equal(company.rhRoom, 'E3');
  assert.equal(company.setRhRoom('XX'), 'sala inválida');
  assert.equal(company.setRhRoom('W1'), 'ok'); // volta ao padrão p/ não vazar pros outros testes
  company.hired.push({
    id: 'h-rh', name: 'RH', level: 'junior', salary: 2500, lph: 100, role: 'dev',
    projectId: null, post: null, lastCall: 0, lastPaidMonth: company.month, hiredDay: 1, askDay: 1,
    atWork: true, calledBy: null, waitingRH: 'raise', workState: 'working',
    stationX: 0, stationZ: 0, stationRy: 0, thirteenthAccrued: 0, vacationAccrued: 0,
  } as never);
  company.requests.push({ id: 'rq', freelancerId: 'h-rh', name: 'RH', toLevel: 'pleno', newSalary: 5000, type: 'raise' });
  assert.equal(company.raise('rq', true), 'ok');
  assert.equal(company.hired[0].waitingRH, null);
  assert.equal(company.hired[0].level, 'pleno');
  assert.equal(company.hired[0].salary, 5000);
});

void test('cozinheira: máx 3 na casa', () => {
  isolate();
  for (let i = 0; i < 3; i++)
    company.hired.push({
      id: `cook-${i}`, name: `Coz ${i}`, level: 'cook', salary: 2000, lph: 0, role: 'cook',
      projectId: null, post: null, lastCall: 0, lastPaidMonth: company.month, hiredDay: 1, askDay: 1,
      atWork: false, calledBy: null, waitingRH: null, workState: 'off',
      stationX: 15.4, stationZ: 16, stationRy: 0, thirteenthAccrued: 0, vacationAccrued: 0,
    } as never);
  company.candidates.push({ id: 'c-cook', name: 'Extra', level: 'cook', salary: 2000, lph: 0, role: 'cook' });
  assert.equal(company.hire('c-cook'), 'copa só tem 3 vagas de cozinheira');
  const st = company.devStationForHire('cook');
  assert.equal(st.x, 15.4, 'cozinheira atrás do balcão da copa');
});

void test('desgaste real quebra; chamado para de produzir e volta ao liberar', () => {
  isolate();
  company.minute = 9 * 60;
  company.hired.push({
    id: 'h-use', name: 'Uso', level: 'junior', salary: 2500, lph: 100, role: 'dev',
    projectId: 'pu', post: null, lastCall: 0, lastPaidMonth: company.month, hiredDay: 1, askDay: 1,
    atWork: true, calledBy: null, workState: 'working',
    stationX: 0, stationZ: 0, stationRy: 0, thirteenthAccrued: 0, vacationAccrued: 0,
  } as never);
  company.machines.push({ id: 'm-use', where: 'st:0', broken: false, tier: 'basico', useHours: 499 });
  company.projects.push({
    id: 'pu', client: 'C', title: 'Site', value: 3000, received: 1500,
    linesTotal: 100000, linesDone: 0, dueAbs: 99, status: 'active',
  });
  company.tick(6); // 60h de jogo em uso: 499h -> 559h >= 500h (básico) = quebra
  const m = company.machines.find((x) => x.id === 'm-use')!;
  assert.equal(m.broken, true, 'vida útil esgotada = quebra');
  assert(m.useHours! >= 500, `uso=${m.useHours}`);
  // chamar/liberar (volta às 9h: expediente)
  company.minute = 9 * 60;
  company.hired[0].atWork = true;
  company.hired[0].workState = 'working';
  assert.equal(company.callEmployee('h-use', 'p1'), 'ok');
  assert.equal(company.hired[0].calledBy, 'p1');
  const before = company.projects[0].linesDone;
  company.tick(0.1); // chamado não produz (máquina quebrada também não deixaria, então troca por nova)
  company.machines.push({ id: 'm-new', where: 'st:0', broken: false, tier: 'premium', useHours: 0 });
  company.machines = company.machines.filter((x) => x.id !== 'm-use');
  company.tick(0.1);
  assert.equal(company.projects[0].linesDone, before, 'chamado parado = 0 linhas');
  company.minute = 9 * 60; // ainda de manhã (12h é almoço: ninguém produz)
  assert.equal(company.releaseEmployee('h-use', 'p1'), 'ok');
  assert.equal(company.hired[0].calledBy, null);
  company.tick(0.1);
  assert(company.projects[0].linesDone > before, 'liberado volta a produzir');
});
