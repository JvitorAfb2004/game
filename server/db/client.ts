import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env.ts';
import * as schema from './schema.ts';

export const pool = new Pool({ connectionString: env.databaseUrl, ssl: false });
export const db = drizzle(pool, { schema });

// ponytail: migração idempotente em SQL cru; drizzle-kit é overkill para 4 tabelas.
export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS player_positions (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      x real NOT NULL, y real NOT NULL, z real NOT NULL, yaw real NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS computer_files (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      computer_id text NOT NULL,
      name text NOT NULL,
      content text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (computer_id, name)
    );
    CREATE TABLE IF NOT EXISTS room_state (
      room_id text PRIMARY KEY,
      plaque_text text NOT NULL DEFAULT ''
    );
    ALTER TABLE computer_files ADD COLUMN IF NOT EXISTS pos_x real NOT NULL DEFAULT 0;
    ALTER TABLE computer_files ADD COLUMN IF NOT EXISTS pos_y real NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS computer_state (
      computer_id text PRIMARY KEY,
      state jsonb NOT NULL DEFAULT '{}',
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}
