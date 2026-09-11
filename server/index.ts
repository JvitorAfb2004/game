import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './env.ts';
import { migrate } from './db/client.ts';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get('/health', async () => ({ ok: true }));

await migrate();
await app.listen({ port: env.port, host: '0.0.0.0' });
console.info(`[server] listening on http://0.0.0.0:${env.port}`);
