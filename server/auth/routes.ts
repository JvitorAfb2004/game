import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { users } from '../db/schema.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { signToken } from './tokens.ts';

const creds = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(24)
    .regex(/^[\w.-]+$/),
  password: z.string().min(4).max(72),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (req, reply) => {
    const parsed = creds.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'dados inválidos' });
    const { username, password } = parsed.data;
    const existing = await db.select().from(users).where(eq(users.username, username));
    if (existing.length) return reply.code(409).send({ error: 'usuário em uso' });
    const [user] = await db
      .insert(users)
      .values({ username, passwordHash: await hashPassword(password) })
      .returning();
    return { token: signToken(user.id, user.username), username: user.username };
  });

  app.post('/auth/login', async (req, reply) => {
    const parsed = creds.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'dados inválidos' });
    const { username, password } = parsed.data;
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user || !(await verifyPassword(password, user.passwordHash)))
      return reply.code(401).send({ error: 'login inválido' });
    return { token: signToken(user.id, user.username), username: user.username };
  });
}
