import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAuthRoutes } from './auth/routes.ts';
import { pool } from './db/client.ts';

void test('register + login + duplicado', async () => {
  const app = Fastify();
  await app.register(registerAuthRoutes);
  const username = `u${Date.now()}${Math.floor(Math.random() * 1e6)}`;

  const r1 = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username, password: 'segredo1' },
  });
  assert.equal(r1.statusCode, 200);
  assert.equal(r1.json().username, username);
  assert.ok(r1.json().token);

  const dup = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username, password: 'outra123' },
  });
  assert.equal(dup.statusCode, 409);

  const bad = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username, password: 'errada' },
  });
  assert.equal(bad.statusCode, 401);

  const ok = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username, password: 'segredo1' },
  });
  assert.equal(ok.statusCode, 200);

  await pool.query('DELETE FROM users WHERE username = $1', [username]);
  await app.close();
  await pool.end();
});
