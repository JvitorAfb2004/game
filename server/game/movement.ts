export type Vec3 = { x: number; z: number; yaw?: number };

export const DEFAULT_SPAWN = { x: 0, z: 16.5, yaw: 0 };

// ponytail: validação leve (limites + anti-teleporte). Colisão fina continua no cliente.
const MAX_STEP = 1.5; // ~ sprint 6.1 * dt maior; folga generosa
const BOUNDS = { minX: -23.7, maxX: 23.7, minZ: -41.7, maxZ: 18.5 };

export function clampMove(from: Vec3, x: number, z: number) {
  let dx = x - from.x;
  let dz = z - from.z;
  const len = Math.hypot(dx, dz);
  if (len > MAX_STEP) {
    dx = (dx / len) * MAX_STEP;
    dz = (dz / len) * MAX_STEP;
  }
  return {
    x: Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, from.x + dx)),
    z: Math.min(BOUNDS.maxZ, Math.max(BOUNDS.minZ, from.z + dz)),
  };
}
