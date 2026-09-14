import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { env } from './env.ts';
import { migrate } from './db/client.ts';
import { registerAuthRoutes } from './auth/routes.ts';
import { registerFileRoutes } from './game/files.ts';
import { registerWs, room } from './ws.ts';

const app = Fastify({ logger: true });
// ponytail: em produção restrinja via FRONTEND_URL (vírgulas); vazio = reflete a origem (dev).
await app.register(cors, {
  origin: env.frontendUrl ? env.frontendUrl.split(',').map((s) => s.trim()) : true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

app.get('/health', async () => ({ ok: true }));

await app.register(registerAuthRoutes);
await app.register(registerFileRoutes);
await app.register(websocket);
await migrate();
await app.register(registerWs);
setInterval(() => void room.saveAll(), 2000);
const { company } = await import('./game/company.ts');
company.load();
let companyTicks = 0;
setInterval(() => {
  company.autoPause(1, room.players.size > 0);
  company.tick(1);
  companyTicks += 1;
  if (company.changed || companyTicks % 5 === 0) {
    company.changed = false;
    room.broadcast({ type: 'company', company: company.snapshot() });
  }
}, 1000);
setInterval(() => company.save(), 10000);

await app.listen({ port: env.port, host: '0.0.0.0' });
console.info(`[server] listening on http://0.0.0.0:${env.port}`);
