export const env = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://postgres:i5zoesh13w462760y1w1@192.64.85.57:5436/game?sslmode=disable',
  redisUrl:
    process.env.REDIS_URL ??
    'redis://default:t6i91vsz0paf1snkghda@192.64.85.57:6394',
  jwtSecret: process.env.JWT_SECRET ?? 'meridian-dev-secret-change-me',
};
