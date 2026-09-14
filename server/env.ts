const isProd = process.env.NODE_ENV === 'production';
// ponytail: sem credencial commitada — em produção tudo vem de env (EasyPanel),
// em dev cai para localhost. Troque os segredos e nunca commite o .env.
if (isProd && !process.env.DATABASE_URL) throw new Error('[env] DATABASE_URL não definido');
if (isProd && !process.env.JWT_SECRET) throw new Error('[env] JWT_SECRET não definido');
export const env = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5432/game?sslmode=disable',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET ?? 'meridian-dev-secret-change-me',
  frontendUrl: process.env.FRONTEND_URL ?? '',
};
