# Spec: Polimento Rodada 2 — bugs de gameplay, shell do Windows XP e persistência por computador

## Objective

Corrigir 10 bugs observados em vídeo e implementar 14 melhorias, agrupadas em 4 fases
executáveis e verificáveis. O jogo é um escritório 3D multiplayer (Three.js + React +
Fastify). Fonte do feedback: transcrição de vídeo do usuário (2026-09-11).

Sucesso = as 4 fases implementadas, `npm test`, `npm run server:test`, `npm run build`
e `npm run lint` verdes, e `verify-browser.mjs` cobrindo os novos comportamentos.

## Tech Stack

React 19, TypeScript 5.9, Three.js r180, Vite 8, Fastify 5 + `@fastify/websocket`,
Drizzle ORM + Postgres, Redis (ioredis), Playwright. Node 24. Branch `main`.

## Commands

- Test (unit/headless): `npm test`
- Test (server): `npm run server:test`
- Build: `npm run build`
- Lint: `npm run lint`
- Dev front: `npm run dev` (Vite, porta 5173)
- Dev back: `npm run server` (Fastify, porta 3001)
- E2E: `node verify-browser.mjs` (precisa dos dois servidores)

## Causas-raiz confirmadas (Fase 1)

1. **Avatar fantasma / remotos parados**: `page.tsx` faz `n.onPlayers = setPlayers`
   (só estado React). O engine só recebe remotos em `onWelcome`, que inclui o próprio
   jogador. Resultado: avatares congelados no estado do `welcome` e clone de si mesmo.
   No server, `ws.ts` só faz `room.leave` dentro do `.finally()` de `savePosition`
   (DB remoto lento → fantasma persiste).
2. **Porta atravessável**: `updateDoors` abre por proximidade (`dist < 1`) antes do
   jogador chegar; `doorBlocked` libera passagem quando `|rotation.y| > 0.4`. Sentido de
   abertura fixo (`d.side`), ignorando de onde o jogador vem.
3. **Luz não escurece**: `HemisphereLight(0.7)`, `AmbientLight(0.12)` e
   `DirectionalLight(0.6)` são globais e constantes; `applyLight` só alterna o point
   light da sala.
4. **Interação a distância**: switch `d < 3`, notebook `d < 3.5`.
5. **Z-fighting**: `spawnFloor`/`spawnCeil` coplanares com piso/teto principais; vidro
   sem `polygonOffset` na junção com parede/frame.
6. **Placa verde**: `makePlaque` preenche o canvas com fundo escuro.
7. **Calculadora**: `=` fica fora do grid de teclas (layout); lógica está correta.

## Design por fase

### Fase 1 — Bugs críticos de jogo

- **Remotos**: `welcome` passa a incluir `id`. Server faz broadcast de `players` a cada
  `move` aceito (exceto o remetente) e, no `close`, remove o jogador e faz broadcast
  antes de persistir (persistência fire-and-forget). Cliente unifica
  `applyPlayers(list)` que filtra `id === selfId(self, vem do welcome)` e chama
  `setPlayers` + `engine.setRemotePlayers`. HUD lista/contagem só os outros.
- **Porta**: `doorBlocked` só libera passagem quando `|rotation.y| > 1.2` (quase aberta).
  `updateDoors` escolhe o sentido: vindo do corredor abre para dentro da sala; vindo da
  sala abre para o corredor (sala = `|x| > halfCorridor` para portas `plane:'x'`; sala de
  spawn = `z > d.z` para `plane:'z'`).
- **Iluminação**: reduzir globais (hemisphere 0.7→0.26, ambient 0.12→0.05, directional
  0.6→0.22) e subir point lights (corredor 7→9/dist 13, sala 7→8/dist 9), para sala
  apagada ficar visivelmente escura sem apagar o corredor.
- **Interação**: raio único de 1.2 m para switch e notebook.
- **Z-fighting**: remover `spawnFloor`/`spawnCeil` (o piso/teto principal cobre a área
  estendendo o comprimento até z=18.5) e aplicar `polygonOffset` ao `glassMat`.
- **Spawn**: `spawn.z = 15.6`, `yaw = 0` (olhando para o corredor), verificado no browser.
- **Calculadora**: `=` dentro do grid de teclas.

### Fase 2 — Shell do Windows XP

Novo módulo `app/game/xp.tsx`:
- `useWindows()`: lista de janelas `{ id, app, x, y, minimized, z }`, ações `open`,
  `close`, `minimize`, `focus`, `move`.
- `<XPWindow>`: barra de título com nome do app, botões minimizar (`_`) e fechar (`X`)
  (sem maximizar), arraste por pointer events, foco/z-order.
- Miniatura na barra de tarefas; clique restaura.
- `page.tsx` passa a renderizar as janelas via esse módulo; apps (Notepad, Calculator,
  PlaqueEditor) viram conteúdo de janela.
- Menu Iniciar só com "Encerrar sessão"; remover ícone "Área de trabalho".
- Notepad: criação de arquivo por modal in-game (sem `window.prompt`); nome na barra de
  título; botão salvar explícito + autosave; erro amigável (não "Failed to fetch" cru).
- CSS responsivo de `.xp-app` (input/textarea/botão em coluna, sem estourar).

### Fase 3 — Persistência por computador

- Schema: `computer_files` ganha `pos_x real`, `pos_y real` (posição do ícone na área de
  trabalho). Nova tabela `computer_state(computer_id text pk, state jsonb not null
  default '{}'), updated_at`.
- Rotas: `PUT /files/:id` aceita `content?`, `posX?`, `posY?`; `GET /computers/:id/state`
  e `PUT /computers/:id/state` (layout de janelas + ícones).
- Desktop renderiza os arquivos do computador como ícones arrastáveis; posição salva.
- Estado das janelas (abertas, posição, minimizadas) persiste por computador e é
  restaurado ao abrir o notebook daquela máquina.

### Fase 4 — Visual / gameplay

- **Placa**: canvas transparente, só texto (sem fundo verde), leve brilho; plane já
  deslocado do vidro.
- **Mesa/notebook**: recuar a mesa para perto da parede do fundo (`|x|` maior) e
  orientar o notebook com teclado voltado para o interior (porta) e tampa para a parede
  do fundo.

## Boundaries

- Always: rodar `npm test`, `npm run server:test`, `npm run build`, `npm run lint` antes
  de commitar; UTF-8; commits pequenos por task.
- Ask first: mudanças de schema (Fase 3), qualquer coisa que apague dados.
- Never: commitar segredos; quebrar os testes existentes; usar `window.prompt`.

## Success Criteria

- Avatares remotos aparecem/atualizam/desaparecem corretamente; não há clone do próprio
  jogador; HUD conta só os outros.
- Porta fechada bloqueia; aberta conforme a direção de entrada/saída.
- Sala apagada fica visivelmente escura; corredor continua aceso.
- Prompt de interação só aparece a ≤ ~1.2 m.
- Sem flicker visível na junção do vidro.
- Janelas XP arrastam, minimizam para a barra e fecham; sem `window.prompt`.
- Arquivos e layout do desktop persistem por computador.
- Placa sem fundo verde; mesas recuadas; notebook orientado.
- `npm test`, `npm run server:test`, `npm run build`, `npm run lint` verdes.

## Open Questions

Nenhuma — comportamento definido a partir do feedback em vídeo.
