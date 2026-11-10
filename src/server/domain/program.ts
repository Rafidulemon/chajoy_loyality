import 'server-only';
import type { Tx } from '../db';
import { CARD_COLORS, REWARD_ITEMS, type RewardItem } from '@/lib/program';
import type { Program } from '@/generated/prisma/client';
import type { ProgramDto } from '@/lib/contracts/dto';

/** The loyalty program row. There is always exactly one (created by the invariants migration). */
export async function getProgram(tx: Tx): Promise<Program> {
  return tx.program.findUniqueOrThrow({ where: { id: 1 } });
}

/**
 * Reads the program and keeps a SHARED lock on its row until the transaction ends. Every transaction that changes stamps takes
 * this first (before the card lock), so saving the program cannot slip in the middle of one:
 *
 *   - Saving takes the same row FOR UPDATE, so it waits for every stamp already in progress and holds off new ones, then sweeps
 *     the cards it must complete with nobody changing them, and new stamps afterwards read the new program.
 *   - Shared locks do not block each other, so stamps at the counter still run side by side.
 *   - Locks are always taken in the same order (program, then card), so two transactions can never wait for each other.
 *
 * Without it, a stamp that read the old card size could commit after the save's sweep and leave a card with more stamps than it holds.
 */
export async function getProgramLocked(tx: Tx): Promise<Program> {
  await tx.$queryRaw`SELECT 1 FROM "Program" WHERE "id" = 1 FOR SHARE`;
  return tx.program.findUniqueOrThrow({ where: { id: 1 } });
}

/** The catalogue items for a list of ids, in catalogue order. Unknown ids are dropped. */
export const rewardItemsOf = (ids: readonly string[]): RewardItem[] => REWARD_ITEMS.filter((i) => ids.includes(i.id));

export const isRewardItemId = (id: string) => REWARD_ITEMS.some((i) => i.id === id);
export const isCardColorId = (id: string) => CARD_COLORS.some((c) => c.id === id);

export function toProgramDto(p: Program): ProgramDto {
  return {
    name: { bn: p.nameBn, en: p.nameEn },
    total: p.stampsRequired,
    items: p.rewardItems,
    minPurchase: p.minPurchase,
    dailyLimit: p.dailyLimit,
    expiryDays: p.expiryDays,
    welcome: p.welcomeBonus,
    color: p.cardColor,
    version: p.version,
  };
}
