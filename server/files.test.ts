import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './db/client.ts';

void test('schema de arquivos aceita e limita por computador', async () => {
  const computer = `T${Date.now()}`;
  await pool.query(
    `INSERT INTO computer_files (computer_id, name, content) VALUES ($1, $2, $3)`,
    [computer, 'a.txt', 'ola'],
  );
  const dup = await pool
    .query(`INSERT INTO computer_files (computer_id, name) VALUES ($1, $2)`, [
      computer,
      'a.txt',
    ])
    .then(() => null)
    .catch((e) => e);
  assert.ok(dup, 'nome repetido no mesmo computador falha');
  const other = await pool.query(
    `INSERT INTO computer_files (computer_id, name) VALUES ($1, $2) RETURNING id`,
    [`${computer}x`, 'a.txt'],
  );
  assert.ok(other.rows[0].id, 'mesmo nome em outro computador é permitido');
  await pool.query('DELETE FROM computer_files WHERE computer_id LIKE $1', [
    `${computer}%`,
  ]);
  await pool.end();
});
