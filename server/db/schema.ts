import { pgTable, uuid, text, real, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  character: text('character').notNull().default('azul'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const playerPositions = pgTable('player_positions', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  x: real('x').notNull(),
  y: real('y').notNull(),
  z: real('z').notNull(),
  yaw: real('yaw').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const computerFiles = pgTable('computer_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  computerId: text('computer_id').notNull(),
  name: text('name').notNull(),
  content: text('content').notNull().default(''),
  posX: real('pos_x').notNull().default(0),
  posY: real('pos_y').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const computerState = pgTable('computer_state', {
  computerId: text('computer_id').primaryKey(),
  state: jsonb('state').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const roomState = pgTable('room_state', {
  roomId: text('room_id').primaryKey(),
  plaqueText: text('plaque_text').notNull().default(''),
});

// ponytail: salas privadas (lobbies) — snapshot JSONB + histórico de acessos.
export const rooms = pgTable('rooms', {
  code: text('code').primaryKey(),
  name: text('name').notNull().default('Sala'),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('active'),
  snapshot: jsonb('snapshot').notNull().default({}),
  tickV: real('tick_v').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const roomMembers = pgTable('room_members', {
  roomCode: text('room_code')
    .notNull()
    .references(() => rooms.code, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow().notNull(),
});

export const roomHistory = pgTable('room_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  roomCode: text('room_code')
    .notNull()
    .references(() => rooms.code, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  leftAt: timestamp('left_at', { withTimezone: true }),
});
