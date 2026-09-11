import { z } from 'zod';

export const clientMsg = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('move'),
    x: z.number(),
    z: z.number(),
    y: z.number().optional(),
    yaw: z.number(),
  }),
  z.object({ type: z.literal('light'), roomId: z.string().max(8), on: z.boolean() }),
  z.object({ type: z.literal('plaque'), roomId: z.string().max(8), text: z.string().max(48) }),
  z.object({ type: z.literal('using'), roomId: z.string().max(8).nullable() }),
]);
export type ClientMsg = z.infer<typeof clientMsg>;

export type NetPlayer = {
  id: string;
  username: string;
  x: number;
  z: number;
  yaw: number;
  y?: number;
  using?: string | null;
};
