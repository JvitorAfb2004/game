import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { computerFiles } from '../db/schema.ts';
import { verifyToken } from '../auth/tokens.ts';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    verifyToken(token);
  } catch {
    return reply.code(401).send({ error: 'não autenticado' });
  }
}

export async function registerFileRoutes(app: FastifyInstance) {
  app.get('/files', { preHandler: requireAuth }, async (req, reply) => {
    const computer = z
      .string()
      .max(8)
      .safeParse((req.query as { computer?: string }).computer);
    if (!computer.success) return reply.code(400).send({ error: 'computer inválido' });
    const files = await db
      .select()
      .from(computerFiles)
      .where(eq(computerFiles.computerId, computer.data));
    return { files };
  });

  app.post('/files', { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({
        computer: z.string().max(8),
        name: z.string().min(1).max(32),
        content: z.string().max(20000),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'dados inválidos' });
    const { computer, name, content } = body.data;
    const existing = await db
      .select()
      .from(computerFiles)
      .where(and(eq(computerFiles.computerId, computer), eq(computerFiles.name, name)));
    if (existing.length) return reply.code(409).send({ error: 'arquivo já existe' });
    const [file] = await db
      .insert(computerFiles)
      .values({ computerId: computer, name, content })
      .returning();
    return { file };
  });

  app.put('/files/:id', { preHandler: requireAuth }, async (req, reply) => {
    const id = z.uuid().safeParse((req.params as { id: string }).id);
    const body = z
      .object({
        name: z.string().min(1).max(32).optional(),
        content: z.string().max(20000).optional(),
      })
      .safeParse(req.body);
    if (!id.success || !body.success)
      return reply.code(400).send({ error: 'dados inválidos' });
    const set = { ...body.data, updatedAt: new Date() };
    const [file] = await db
      .update(computerFiles)
      .set(set)
      .where(eq(computerFiles.id, id.data))
      .returning();
    if (!file) return reply.code(404).send({ error: 'arquivo não encontrado' });
    return { file };
  });

  app.delete('/files/:id', { preHandler: requireAuth }, async (req, reply) => {
    const id = z.uuid().safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(400).send({ error: 'id inválido' });
    await db.delete(computerFiles).where(eq(computerFiles.id, id.data));
    return { ok: true };
  });
}
