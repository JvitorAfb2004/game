import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { env } from './env.ts';
import { migrate } from './db/client.ts';
import { registerAuthRoutes } from './auth/routes.ts';
import { registerFileRoutes } from './game/files.ts';
import { registerWs, room } from './ws.ts';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get('/health', async () => ({ ok: true }));

await app.register(registerAuthRoutes);
await app.register(registerFileRoutes);
await app.register(websocket);
await app.register(registerWs);
setInterval(() => void room.saveAll(), 2000);

await migrate();
await app.listen({ port: env.port, host: '0.0.0.0' });
console.info(`[server] listening on http://0.0.0.0:${env.port}`);
