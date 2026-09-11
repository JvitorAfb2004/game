import jwt from 'jsonwebtoken';
import { env } from '../env.ts';

// ponytail: token único de 7d evita endpoint de refresh; adicionar refresh se expiração incomodar.
export const signToken = (userId: string, username: string) =>
  jwt.sign({ sub: userId, username }, env.jwtSecret, { expiresIn: '7d' });

export function verifyToken(token: string): { sub: string; username: string } {
  return jwt.verify(token, env.jwtSecret) as { sub: string; username: string };
}
