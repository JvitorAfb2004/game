import { z } from 'zod';

export const clientMsg = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('move'),
    x: z.number(),
    z: z.number(),
    y: z.number().optional(),
    yaw: z.number(),
    crouch: z.boolean().optional(),
  }),
  z.object({ type: z.literal('light'), roomId: z.string().max(8), on: z.boolean() }),
  z.object({ type: z.literal('plaque'), roomId: z.string().max(8), text: z.string().max(48) }),
  z.object({ type: z.literal('using'), roomId: z.string().max(8).nullable() }),
  z.object({ type: z.literal('callNext') }),
  z.object({ type: z.literal('attend'), botId: z.string().max(64) }),
  z.object({ type: z.literal('answer'), botId: z.string().max(64), accept: z.boolean() }),
  z.object({ type: z.literal('payBill'), billId: z.string().max(16) }),
  z.object({ type: z.literal('deliver'), projectId: z.string().max(64) }),
  z.object({ type: z.literal('hire'), candidateId: z.string().max(64) }),
  z.object({ type: z.literal('assign'), freelancerId: z.string().max(64), projectId: z.string().max(64).nullable() }),
  z.object({ type: z.literal('paySalary'), freelancerId: z.string().max(64) }),
  z.object({ type: z.literal('payDebt'), debtId: z.string().max(64) }),
  z.object({ type: z.literal('work'), projectId: z.string().max(64).nullable(), user: z.string().max(24).optional() }),
  z.object({ type: z.literal('raise'), requestId: z.string().max(64), accept: z.boolean() }),
  z.object({ type: z.literal('hold'), botId: z.string().max(64) }),
  z.object({ type: z.literal('talk'), botId: z.string().max(64), text: z.string().min(1).max(140) }),
  z.object({ type: z.literal('pause'), paused: z.boolean() }),
  z.object({ type: z.literal('fire'), freelancerId: z.string().max(64) }),
  z.object({ type: z.literal('post'), freelancerId: z.string().max(64), index: z.number().min(0).max(2).nullable() }),
  z.object({ type: z.literal('buyNotebook'), tier: z.enum(['basico', 'inter', 'premium']).optional() }),
  z.object({ type: z.literal('buyDolly') }),
  z.object({ type: z.literal('setRhRoom'), roomId: z.string().max(8) }),
  z.object({ type: z.literal('claimBox'), boxId: z.string().max(64) }),
  z.object({ type: z.literal('dropBox'), boxId: z.string().max(64), x: z.number(), z: z.number() }),
  z.object({
    type: z.literal('placeBox'),
    boxId: z.string().max(64),
    station: z.number().min(0).max(11).nullable(),
    room: z.string().max(8).nullable(),
  }),
  z.object({ type: z.literal('uninstallMachine'), machineId: z.string().max(64) }),
  z.object({ type: z.literal('repairMachine'), machineId: z.string().max(64) }),
  z.object({ type: z.literal('callEmployee'), freelancerId: z.string().max(64) }),
  z.object({ type: z.literal('releaseEmployee'), freelancerId: z.string().max(64) }),
  z.object({ type: z.literal('dollyPos'), x: z.number(), z: z.number() }),
  z.object({ type: z.literal('rentRoom'), roomId: z.string().max(8) }),
]);
export type ClientMsg = z.infer<typeof clientMsg>;

export type NetPlayer = {
  id: string;
  username: string;
  character?: string;
  x: number;
  z: number;
  yaw: number;
  y?: number;
  crouch?: boolean;
  using?: string | null;
};
