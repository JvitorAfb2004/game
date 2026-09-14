import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { env } from './env.ts';
import { migrate } from './db/client.ts';
import { registerAuthRoutes } from './auth/routes.ts';
import { registerFileRoutes } from './game/files.ts';
import { registerRoomRoutes, manager } from './game/rooms.ts';
import { registerWs } from './ws.ts';

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
await app.register(registerRoomRoutes);
await app.register(websocket);
await migrate();
await app.register(registerWs);
// ponytail: 1 tick/s por sala ativa; vazia há 5min hiberna (serializa no Postgres, sai da RAM).
setInterval(() => manager.tickAll(1), 1000);
setInterval(() => void manager.saveAll(), 10000);

await app.listen({ port: env.port, host: '0.0.0.0' });
console.info(`[server] listening on http://0.0.0.0:${env.port}`);
