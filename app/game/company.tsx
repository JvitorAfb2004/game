'use client';
import { useEffect, useState } from 'react';
import type { CompanyState } from './net';

type NetLike = {
  callNext(): void;
  attend(botId: string): void;
  answer(botId: string, accept: boolean): void;
  hold(botId: string): void;
  talk(botId: string, text: string): void;
  payBill(billId: string): void;
  deliver(projectId: string): void;
  pause(paused: boolean): void;
  hire(candidateId: string): void;
  assign(freelancerId: string, projectId: string | null): void;
  paySalary(freelancerId: string): void;
  payDebt(debtId: string): void;
  work(projectId: string | null, user?: string): void;
  raise(requestId: string, accept: boolean): void;
  fire(freelancerId: string): void;
  post(freelancerId: string, index: number | null): void;
  buyNotebook(tier?: string): void;
  buyDolly(): void;
  rentRoom(roomId: string): void;
  setRhRoom(roomId: string): void;
  uninstallMachine(machineId: string): void;
  repairMachine(machineId: string): void;
};

type Tab = 'recepcao' | 'atendimento' | 'equipe' | 'projetos' | 'estoque' | 'mercado' | 'config' | 'financeiro' | 'historico';

const brl = (v: number | null | undefined) => `R$${(v ?? 0).toLocaleString('pt-BR')}`;
const LEVEL_PT: Record<string, string> = { junior: 'Júnior', pleno: 'Pleno', senior: 'Sênior', recep: 'Recepcionista', cook: 'Cozinheira' };

export function CompanyApp({
  company,
  net,
  computerId,
  username,
}: {
  company: CompanyState | null;
  net: NetLike | null;
  computerId?: string | null;
  username?: string;
}) {
  // fila/atendimento: só nos PCs da recepção. Recepção: recepção+atender+estoque
  // (estoque aqui quebra o deadlock: se todos os PCs quebrarem, dá p/ consertar).
  const isRec = computerId === 'REC' || computerId === 'REC2' || computerId === 'REC3';
  const [tab, setTab] = useState<Tab>(isRec ? 'recepcao' : 'projetos');
  const [workId, setWorkId] = useState<string | null>(null);
  const [projFilter, setProjFilter] = useState<'all' | 'active' | 'delivered'>('all');
  const [mlQuery, setMlQuery] = useState('');

  // heartbeat: enquanto a tela de trabalho está aberta, gera código (rende como júnior).
  // Fechou o PC, trocou de aba ou deslogou: o cleanup avisa e o server tira do trabalho.
  // workActive é derivado no render (sem setState em efeito): invalidez para sozinha.
  const workActive =
    workId && tab === 'projetos' && company?.projects.some((x) => x.id === workId && x.status === 'active')
      ? workId
      : null;
  useEffect(() => {
    if (!workActive || !net) return;
    net.work(workActive, username);
    const id = window.setInterval(() => net.work(workActive, username), 5000);
    return () => {
      window.clearInterval(id);
      net.work(null);
    };
  }, [workActive, net, username]);

  if (!company)
    return (
      <output className="erp">
        <p className="erp-empty">Conectando ao servidor…</p>
      </output>
    );

  const due = company.bills.filter((b) => b.paidMonth !== company.month);
  const dueTotal = due.reduce((s, b) => s + b.amount + b.lateFee, 0);
  const unpaidSalaries = company.hired.filter((h) => h.lastPaidMonth !== company.month);
  const salaryTotal = unpaidSalaries.reduce((s, h) => s + h.salary, 0);
  const debtTotal = company.debts.reduce((s, d) => s + d.amount, 0);
  const receivable = company.projects
    .filter((p) => p.status === 'active')
    .reduce((s, p) => s + p.value - p.received, 0);
  const activeProjects = company.projects.filter((p) => p.status === 'active').length;
  // badge do estoque: só o que precisa de ação — a caminho + caixas paradas no spawn + quebradas
  const spawnWaiting = company.packages.filter((p) => !p.claimer && p.x == null).length;
  const brokenCount = company.machines.filter((m) => m.broken && m.where !== 'box').length;
  const stockBadge = company.deliveries.length + spawnWaiting + brokenCount || undefined;
  const a = company.attending;
  const working = workActive ? company.projects.find((p) => p.id === workActive) : null;

  const tabs: { id: Tab; label: string; icon: string; badge?: number }[] = (
    isRec
      ? [
          { id: 'recepcao', label: 'Recepção', icon: '🔔', badge: company.queue.length || undefined },
          { id: 'atendimento', label: 'Atender', icon: '💬', badge: a ? 1 : undefined },
          { id: 'estoque', label: 'Estoque', icon: '📦', badge: stockBadge },
          { id: 'mercado', label: 'Mercado Laivre', icon: '🛍️' },
          { id: 'config', label: 'Config', icon: '⚙️' },
        ]
      : [
          { id: 'equipe', label: 'Equipe', icon: '👥', badge: (company.candidates.length || company.requests.length) || undefined },
          { id: 'projetos', label: 'Projetos', icon: '📁', badge: activeProjects || undefined },
          { id: 'estoque', label: 'Estoque', icon: '📦', badge: stockBadge },
          { id: 'mercado', label: 'Mercado Laivre', icon: '🛍️' },
          { id: 'config', label: 'Config', icon: '⚙️' },
          { id: 'financeiro', label: 'Financeiro', icon: '💰', badge: due.length + unpaidSalaries.length + company.debts.length || undefined },
          { id: 'historico', label: 'Histórico', icon: '🕘' },
        ]
  );

  return (
    <div className="erp">
      <nav className="erp-side" aria-label="Menu da empresa">
        <div className="erp-brand">MERIDIAN DEV</div>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'erp-nav active' : 'erp-nav'}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span aria-hidden="true">{t.icon}</span> {t.label}
            {t.badge ? <em className="erp-badge">{t.badge}</em> : null}
          </button>
        ))}
        <div className="erp-side-foot">
          D{company.day}/M{company.month} · {company.clock}
        </div>
      </nav>

      <div className="erp-main">
        <header className="erp-top">
          {!isRec && (
            <span className={`erp-chip ${company.balance < 0 ? 'neg' : ''}`}>{brl(company.balance)}</span>
          )}
          <button
            type="button"
            className={`erp-chip ${company.paused ? 'call' : ''}`}
            title={company.paused ? 'Despausar o jogo (tempo volta a correr)' : 'Pausar o jogo (congela o tempo no servidor)'}
            onClick={() => net?.pause(!company.paused)}
          >
            {company.paused ? '▶ DESPAUSAR' : '⏸ PAUSAR'}
          </button>
          {company.serving ? (
            <span className="erp-chip call">SENHA {company.serving}</span>
          ) : (
            <span className="erp-chip idle">FILA LIVRE</span>
          )}
        </header>

        <div className="erp-page">
          {tab === 'recepcao' && (
            <section aria-label="Fila da recepção">
              <div className="erp-row-between">
                <h3>Fila de espera</h3>
                <button type="button" className="erp-btn primary" onClick={() => net?.callNext()}>
                  📢 Chamar próximo
                </button>
              </div>
              {company.queue.length === 0 ? (
                <p className="erp-empty">Fila vazia — clientes chegam sozinhos na recepção.</p>
              ) : (
                <ul className="erp-list">
                  {company.queue.map((b) => (
                    <li key={b.id} className={b.state === 'called' ? 'erp-item called' : 'erp-item'}>
                      <span className="erp-ticket">S{b.ticket}</span>
                      <span className="erp-item-main">
                        <b>{b.name}</b>
                        <small>{b.state === 'called' ? 'chamado no balcão' : 'aguardando'}</small>
                      </span>
                      <button
                        type="button"
                        className="erp-btn"
                        onClick={() => {
                          net?.attend(b.id);
                          if (isRec) setTab('atendimento');
                        }}
                      >
                        Atender
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'atendimento' && (
            <section aria-label="Atendimento">
              {!a ? (
                <p className="erp-empty">Nenhum atendimento aberto — chame a fila na Recepção.</p>
              ) : (
                <>
                  <h3>
                    S{a.ticket} · {a.name}
                  </h3>
                  {a.chat ? (
                    <>
                      <div className="erp-bubble">“{a.chat.say}”</div>
                      <p className="erp-hint">{a.chat.sub}</p>
                      <div className="erp-actions">
                        {a.chat.opts.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            className={o.id === 'yes' ? 'erp-btn ok' : o.id === 'hold' ? 'erp-btn primary' : 'erp-btn danger'}
                            onClick={() => {
                              if (o.id === 'yes') net?.answer(a.id, true);
                              else if (o.id === 'hold') net?.hold(a.id);
                              else net?.answer(a.id, false);
                            }}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="erp-bubble">“Vocês fazem <b>{a.want}</b>?”</div>
                      <div className="erp-actions">
                        <button type="button" className="erp-btn ok" onClick={() => net?.answer(a.id, true)}>
                          ✅ Sim, fazemos
                        </button>
                        <button type="button" className="erp-btn danger" onClick={() => net?.answer(a.id, false)}>
                          ❌ Não fazemos
                        </button>
                      </div>
                    </>
                  )}
                  <small className="erp-hint">Fechar = entrada de 10–40% na hora (resto na entrega) · Recusar = cliente vai embora</small>
                  <form
                    className="erp-talk"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      const v = fd.get('say');
                      const text = typeof v === 'string' ? v.trim() : '';
                      if (text) net?.talk(a.id, text);
                      e.currentTarget.reset();
                    }}
                  >
                    <input name="say" maxLength={140} placeholder="Falar… (grosso pode denunciar 😡)" aria-label="Falar com o cliente" />
                    <button type="submit" className="erp-btn primary">➤</button>
                  </form>
                </>
              )}
            </section>
          )}

          {tab === 'equipe' && (
            <section aria-label="Central de vagas">
              <h3>Contratados ({company.hired.length}) · devs home office</h3>
              {company.hired.length === 0 ? (
                <p className="erp-empty">Ninguém contratado — veja os candidatos abaixo.</p>
              ) : (
                <ul className="erp-list">
                  {company.hired.map((h) => {
                    const acerto = h.lastPaidMonth === company.month ? 0 : Math.round(((h.salary * company.day) / 30) * 100) / 100;
                    return (
                      <li key={h.id} className="erp-item">
                      <span className="erp-item-main">
                        <b>
                          {h.name} · {h.role === 'manager' ? `Gerente (${LEVEL_PT[h.level] ?? h.level})` : (LEVEL_PT[h.level] ?? h.level)}
                        </b>
                        <small>
                          {brl(h.salary)}/mês
                          {h.role === 'dev' ? ` · ${h.lph} linhas/h` : ''} ·{' '}
                          {h.role === 'manager' && '⚙️ distribui os devs sozinho · '}
                          {h.role === 'dev' && !h.hasPC && <em className="erp-late">⚠️ sem computador · </em>}
                          {h.lastPaidMonth === company.month ? 'salário pago ✅' : 'salário a pagar ⚠️'}
                        </small>
                          {h.role === 'dev' ? (
                            <label className="erp-hint">
                              Projeto:{' '}
                              <select
                                value={h.projectId ?? ''}
                                onChange={(e) => net?.assign(h.id, e.target.value || null)}
                                aria-label={`Projeto de ${h.name}`}
                              >
                                <option value="">— livre —</option>
                                {company.projects
                                  .filter((p) => p.status === 'active')
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.title}
                                    </option>
                                  ))}
                              </select>
                            </label>
                          ) : h.role === 'recep' ? (
                            <label className="erp-hint">
                              Balcão:{' '}
                              <select
                                value={h.post ?? ''}
                                onChange={(e) => net?.post(h.id, e.target.value === '' ? null : Number(e.target.value))}
                                aria-label={`Balcão de ${h.name}`}
                              >
                                <option value="">— livre —</option>
                                <option value={0}>Balcão 1</option>
                                <option value={1}>Balcão 2</option>
                                <option value={2}>Balcão 3</option>
                              </select>
                            </label>
                          ) : h.role === 'cook' ? (
                            <small className="erp-hint">
                              🍳 cozinha na copa — com cozinheira o pessoal almoça lá
                            </small>
                          ) : (
                            <small className="erp-hint">
                              ⚙️ revisa a equipe a cada{' '}
                              {h.level === 'senior' ? '15min' : h.level === 'pleno' ? '30min' : '1h'} de jogo ·
                              sobe de nível com aumento
                            </small>
                          )}
                        </span>
                        {h.lastPaidMonth !== company.month && (
                          <button type="button" className="erp-btn primary" onClick={() => net?.paySalary(h.id)}>
                            Pagar {brl(h.salary)}
                          </button>
                        )}
                        <small className="erp-hint" title={acerto > 0 ? `Acerto pendente: ${brl(acerto)}` : 'Mês já pago, sem acerto'}>
                          📣 p/ demitir: mire nele na sala e tecle E
                        </small>
                      </li>
                    );
                  })}
                </ul>
              )}
              <h3>Solicitações ({company.requests.length})</h3>
              {company.requests.length === 0 ? (
                <p className="erp-empty">Nenhum pedido — devs pedem aumento após ~14 dias de casa.</p>
              ) : (
                <ul className="erp-list">
                  {company.requests.map((r) => (
                    <li key={r.id} className="erp-item called">
                      <span className="erp-item-main">
                        {r.type === 'resign' ? (
                          <>
                            <b>📝 {r.name} pediu demissão</b>
                            <small>acerto: {brl(r.total ?? 0)}</small>
                          </>
                        ) : (
                          <>
                            <b>{r.name} quer virar {LEVEL_PT[r.toLevel ?? ''] ?? r.toLevel}</b>
                            <small>novo salário: {brl(r.newSalary ?? 0)}/mês</small>
                          </>
                        )}
                        <small className="erp-hint">📍 esperando na sala {company.rhRoom ?? '?'} — mire nele e tecle E</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <h3>Vagas — candidatos ({company.candidates.length})</h3>
              {company.candidates.length === 0 ? (
                <p className="erp-empty">Sem candidatos — chegam mais a cada mês.</p>
              ) : (
                <ul className="erp-list">
                  {company.candidates.map((c) => (
                    <li key={c.id} className="erp-item">
                      <span className="erp-item-main">
                        <b>
                          {c.name} · {c.role === 'manager' ? 'Gerente' : (LEVEL_PT[c.level] ?? c.level)}
                        </b>
                        <small>
                          {brl(c.salary)}/mês
                          {c.role === 'dev'
                            ? ` · ${c.lph} linhas/h de jogo`
                            : c.role === 'manager'
                              ? ' · distribui os devs sozinho (só cabe 1)'
                              : c.role === 'cook'
                                ? ' · cozinha na copa no almoço (máx 3)'
                                : ' · chama a fila sozinha no balcão'}
                        </small>
                      </span>
                      <button type="button" className="erp-btn primary" onClick={() => net?.hire(c.id)}>
                        Contratar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'projetos' && (
            <section aria-label="Projetos fechados">
              <div className="erp-row-between">
                <h3>Carteira ({company.projects.length})</h3>
                <fieldset className="erp-filters">
                  <legend>Filtrar projetos</legend>
                  {(['all', 'active', 'delivered'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={projFilter === f ? 'erp-btn primary' : 'erp-btn'}
                      aria-pressed={projFilter === f}
                      onClick={() => setProjFilter(f)}
                    >
                      {f === 'all' ? 'Todos' : f === 'active' ? 'Em andamento' : 'Finalizados'}
                    </button>
                  ))}
                </fieldset>
              </div>
              {working && (
                <output className="erp-work">
                  <b>
                    💻 Você está codando: {working.title} {working.status !== 'active' && '(finalizado)'}
                  </b>
                  <span className="erp-bar work" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, Math.round((working.linesDone / working.linesTotal) * 100))}%` }} />
                  </span>
                  <small>
                    {Math.round(working.linesDone).toLocaleString('pt-BR')}/{working.linesTotal.toLocaleString('pt-BR')} linhas ·
                    rende de júnior ({100} linhas/h de jogo) · mantenha esta tela aberta
                  </small>
                  <div className="erp-actions">
                    <button type="button" className="erp-btn danger" onClick={() => setWorkId(null)}>
                      Parar
                    </button>
                  </div>
                </output>
              )}
              {company.projects.length === 0 ? (
                <p className="erp-empty">Nenhum projeto fechado — atenda a fila.</p>
              ) : (
                <ul className="erp-list">
                  {company.projects
                    .filter((p) => projFilter === 'all' || p.status === projFilter)
                    .map((p) => {
                    const pct = Math.min(100, Math.round((p.linesDone / p.linesTotal) * 100));
                    const ready = p.linesDone >= p.linesTotal;
                    const late = p.status === 'active' && company.absDay > p.dueAbs;
                    const lateDays = late ? company.absDay - p.dueAbs : 0;
                    return (
                      <li key={p.id} className={late ? 'erp-item crit' : 'erp-item'}>
                        <span className="erp-item-main">
                          <b>
                            {p.title}{' '}
                            {p.status === 'active' &&
                              (late ? (
                                <em className="erp-pill crit">ATRASADO {lateDays}d · -5%/dia</em>
                              ) : pct >= 80 ? (
                                <em className="erp-pill soon">quase lá</em>
                              ) : null)}
                          </b>
                          <small>
                            {p.client} · {brl(p.received)}/{brl(p.value)} ·{' '}
                            {Math.round(p.linesDone).toLocaleString('pt-BR')}/{p.linesTotal.toLocaleString('pt-BR')} linhas ({pct}%)
                            {p.status === 'active' && ` · vence D${((p.dueAbs - 1) % 30) + 1}`}
                            {p.status === 'delivered'
                              ? ' · entregue'
                              : ready
                                ? ' · pronto ✅'
                                : ` · devs: ${p.devs.length ? p.devs.join(', ') : 'nenhum'}${p.workers.length ? ` · codando: ${p.workers.join(', ')}` : ''}`}
                          </small>
                          <span className="erp-bar" aria-hidden="true">
                            <span style={{ width: `${pct}%` }} />
                          </span>
                        </span>
                        {p.status === 'active' && (
                          <>
                            {workActive === p.id ? (
                              <button type="button" className="erp-btn" onClick={() => setWorkId(null)}>
                                Parar
                              </button>
                            ) : (
                              <button type="button" className="erp-btn" onClick={() => setWorkId(p.id)}>
                                💻 Trabalhar
                              </button>
                            )}
                            <button
                              type="button"
                              className="erp-btn primary"
                              disabled={!ready}
                              title={ready ? `Receber ${brl(p.value - p.received)}` : 'Complete as linhas primeiro'}
                              onClick={() => net?.deliver(p.id)}
                            >
                              Entregar{ready ? ` +${brl(p.value - p.received)}` : ` (${pct}%)`}
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {tab === 'estoque' && (
            <section aria-label="Estoque de notebooks">
              <div className="erp-row-between">
                <h3>Notebooks p/ devs</h3>
                <small className="erp-hint">compras agora no 🛍️ Mercado Laivre (aba ao lado)</small>
              </div>
              <p className="erp-hint">
                Estações com PC: {company.stations.filter((s) => s === 'ok').length}/12 · dev sem PC não rende ·
                quebrou? conserta aqui · desinstalar: técnico busca e paga 10% de sucata
              </p>
              {company.machines.length > 0 && (
                <>
                  <h3>Máquinas ({company.machines.length})</h3>
                  <ul className="erp-list">
                    {company.machines.map((m) => (
                      <li key={m.id} className={m.broken ? 'erp-item crit' : 'erp-item'}>
                        <span className="erp-item-main">
                          <b>💻 {m.label}</b>
                          <small>{m.broken ? <em className="erp-late">QUEBRADA — dev/sala parados</em> : m.where === 'box' ? 'na caixa (spawn)' : `funcionando · ${Math.round(m.useHours ?? 0)}h de uso`}</small>
                        </span>
                        {m.broken && !m.tech && (
                          <button type="button" className="erp-btn primary" onClick={() => net?.repairMachine(m.id)}>
                            Consertar R$800
                          </button>
                        )}
                        {m.broken && m.tech && <small>🔧 técnico a caminho</small>}
                        {!m.tech && m.where !== 'box' && (
                          <button type="button" className="erp-btn" title="Técnico busca e paga 10% de sucata" onClick={() => net?.uninstallMachine(m.id)}>
                            📦 Vender sucata
                          </button>
                        )}
                        {m.tech && m.where !== 'box' && !m.broken && <small>📦 técnico a caminho p/ buscar</small>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {company.deliveries.length > 0 && (
                <>
                  <h3>A caminho</h3>
                  <ul className="erp-list">
                    {company.deliveries.map((d) => (
                      <li key={d.id} className="erp-item">
                        <span className="erp-item-main">
                          <b>📦 Caixa de notebook {d.tier === 'premium' ? 'Premium' : d.tier === 'inter' ? 'Inter' : 'Básico'}</b>
                          <small>
                            chega em {Math.floor(d.etaMin / 60)}h {d.etaMin % 60}min de jogo · retire no spawn
                          </small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {company.packages.length > 0 && (
                <>
                  {company.packages.filter((p) => !p.claimer && p.x == null).length > 0 && (
                    <>
                      <h3>
                        No spawn ({company.packages.filter((p) => !p.claimer && p.x == null).length})
                      </h3>
                      <ul className="erp-list">
                        {company.packages
                          .filter((p) => !p.claimer && p.x == null)
                          .map((p) => (
                            <li key={p.id} className="erp-item">
                              <span className="erp-item-main">
                                <b>📦 Caixa aguardando</b>
                                <small>vá ao spawn, mire e aperte E para pegar</small>
                              </span>
                            </li>
                          ))}
                      </ul>
                    </>
                  )}
                  {company.packages.filter((p) => p.claimer).length > 0 && (
                    <>
                      <h3>Em mãos ({company.packages.filter((p) => p.claimer).length})</h3>
                      <ul className="erp-list">
                        {company.packages
                          .filter((p) => p.claimer)
                          .map((p) => (
                            <li key={p.id} className="erp-item">
                              <span className="erp-item-main">
                                <b>📦 Com {p.claimer}</b>
                                <small>alguém já pegou — instale numa estação ou sala</small>
                              </span>
                            </li>
                          ))}
                      </ul>
                    </>
                  )}
                </>
              )}
              {company.hired.filter((h) => h.role === 'dev' && !h.hasPC).length > 0 && (
                <>
                  <h3>Pendentes de computador</h3>
                  <ul className="erp-list">
                    {company.hired
                      .filter((h) => h.role === 'dev' && !h.hasPC)
                      .map((h) => (
                        <li key={h.id} className="erp-item">
                          <span className="erp-item-main">
                            <b>{h.name}</b>
                            <small>contratado sem estação — compre e instale um notebook</small>
                          </span>
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {tab === 'mercado' && (
            <section aria-label="Mercado Laivre">
              <div className="erp-row-between" style={{ background: '#ffe600', margin: '-0.5rem -0.5rem 0.5rem', padding: '0.5rem', borderRadius: '4px' }}>
                <h3 style={{ margin: 0 }}>🛍️ Mercado Laivre</h3>
                <input
                  aria-label="Buscar no Mercado Laivre"
                  placeholder="🔎 Buscar notebook, carrinho…"
                  value={mlQuery}
                  onChange={(e) => setMlQuery(e.target.value)}
                  style={{ maxWidth: '12rem' }}
                />
              </div>
              <p className="erp-hint">
                Saldo: {brl(company.balance)} · tudo à vista no saldo da empresa · retire no spawn
              </p>
              <h3>🏢 Salas para alugar ({company.ownedRooms.length}/6 abertas)</h3>
              <ul className="erp-list">
                {company.rentInfo.rooms.map((r) => {
                  const owned = company.ownedRooms.includes(r);
                  if (owned) return null;
                  return (
                    <li key={r} className="erp-item">
                      <span className="erp-item-main">
                        <b>🔒 Sala {r}</b>
                        <small>entrada {brl(company.rentInfo.entry)} + {brl(company.rentInfo.monthly)}/mês (dia 10)</small>
                      </span>
                      <button type="button" className="erp-btn primary" onClick={() => net?.rentRoom(r)}>
                        Alugar
                      </button>
                    </li>
                  );
                })}
              </ul>
              {company.rentInfo.rooms.every((r) => company.ownedRooms.includes(r)) && (
                <p className="erp-empty">Todas as salas alugadas ✅</p>
              )}
              <ul className="erp-list">
                {(
                  [
                    { id: 'nb-basico', icon: '💻', name: 'Notebook Básico', price: 3500, desc: 'Dura ~500h de uso real', eta: '📦 chega em 1 dia no spawn', buy: () => net?.buyNotebook('basico') },
                    { id: 'nb-inter', icon: '💻', name: 'Notebook Inter', price: 6000, desc: 'Dura ~1200h de uso real', eta: '📦 chega em 1 dia no spawn', buy: () => net?.buyNotebook('inter') },
                    { id: 'nb-premium', icon: '💻', name: 'Notebook Premium', price: 10000, desc: 'Dura ~2500h de uso real', eta: '📦 chega em 1 dia no spawn', buy: () => net?.buyNotebook('premium') },
                    { id: 'dolly', icon: '🛒', name: 'Carrinho de carga', price: 1500, desc: 'Leva 3 caixas · -40% velocidade · sem pulo', eta: '⚡ entrega imediata no spawn', owned: company.dollyOwned, buy: () => net?.buyDolly() },
                  ] as { id: string; icon: string; name: string; price: number; desc: string; eta: string; owned?: boolean; buy: () => void }[]
                )
                  .filter((p) => p.name.toLowerCase().includes(mlQuery.trim().toLowerCase()))
                  .map((p) => (
                    <li key={p.id} className="erp-item">
                      <span style={{ fontSize: '1.8rem' }} aria-hidden="true">{p.icon}</span>
                      <span className="erp-item-main">
                        <b>{p.name}</b>
                        <small>{p.desc}</small>
                        <small>{p.eta}</small>
                        <b style={{ color: '#00a650' }}>{brl(p.price)} à vista</b>
                      </span>
                      {p.owned ? (
                        <small>✅ comprado</small>
                      ) : (
                        <button type="button" className="erp-btn primary" onClick={p.buy}>
                          Comprar
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {tab === 'config' && (
            <section aria-label="Configurações da empresa">
              <h3>⚙️ Configurações</h3>
              <ul className="erp-list">
                <li className="erp-item">
                  <span className="erp-item-main">
                    <b>🏢 Sala de RH</b>
                    <small>Pedidos de aumento/demissão esperam resposta lá (anel vermelho, fale com E)</small>
                  </span>
                  <label className="erp-hint">
                    Sala:{' '}
                    <select
                      value={company.rhRoom ?? ''}
                      onChange={(e) => e.target.value && net?.setRhRoom(e.target.value)}
                      aria-label="Sala de RH"
                    >
                      {[...new Set([...company.ownedRooms, company.rhRoom ?? 'W1'])].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              </ul>
            </section>
          )}

          {tab === 'financeiro' && (
            <section aria-label="Financeiro">
              <dl className="erp-meta">
                <div>
                  <dt>Saldo</dt>
                  <dd>{brl(company.balance)}</dd>
                </div>
                <div>
                  <dt>A receber</dt>
                  <dd>{brl(receivable)}</dd>
                </div>
                <div>
                  <dt>A pagar (mês)</dt>
                  <dd>{brl(dueTotal + salaryTotal)}</dd>
                </div>
                <div>
                  <dt>Dívidas</dt>
                  <dd>{brl(debtTotal)}</dd>
                </div>
              </dl>
              <p className="erp-hint">Tudo manual — nada debita sozinho. Contas venc dia 10 (+2%/dia) · salários dia 5 (atraso = freela sai + dívida com juros).</p>
              <h3>Contas fixas</h3>
              {due.length === 0 ? (
                <p className="erp-empty">Todas as contas do mês pagas ✅</p>
              ) : (
                <ul className="erp-list">
                  {due.map((b) => (
                    <li key={b.id} className="erp-item">
                      <span className="erp-item-main">
                        <b>{b.name}</b>
                        <small>
                          {brl(b.amount)}
                          {b.lateFee > 0 && <em className="erp-late"> +{brl(b.lateFee)} multa</em>}
                        </small>
                      </span>
                      <button type="button" className="erp-btn primary" onClick={() => net?.payBill(b.id)}>
                        Pagar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <h3>Salários ({unpaidSalaries.length} a pagar)</h3>
              {unpaidSalaries.length === 0 ? (
                <p className="erp-empty">Folha do mês quitada ✅</p>
              ) : (
                <ul className="erp-list">
                  {unpaidSalaries.map((h) => (
                    <li key={h.id} className="erp-item">
                      <span className="erp-item-main">
                        <b>{h.name}</b>
                        <small>{brl(h.salary)}</small>
                      </span>
                      <button type="button" className="erp-btn primary" onClick={() => net?.paySalary(h.id)}>
                        Pagar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {company.debts.length > 0 && (
                <>
                  <h3>Dívidas (juros 5%/dia)</h3>
                  <ul className="erp-list">
                    {company.debts.map((d) => (
                      <li key={d.id} className="erp-item">
                        <span className="erp-item-main">
                          <b>{d.who}</b>
                          <small className="erp-late">{brl(d.amount)}</small>
                        </span>
                        <button type="button" className="erp-btn danger" onClick={() => net?.payDebt(d.id)}>
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {tab === 'historico' && (
            <section aria-label="Histórico">
              <h3>Movimentações</h3>
              <ul className="erp-log">
                {company.log.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
