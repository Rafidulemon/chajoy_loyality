import { db } from '@/server/db';
import { previewProgramImpact } from '@/server/domain/admin-program';
import { staffRoute } from '@/server/http';
import { programImpactQuery } from '@/lib/contracts/schemas';
import type { ProgramImpactDto } from '@/lib/contracts/admin';

/** MG-09: how many cards and vouchers saving a card of `total` stamps would complete right now, for the warning before saving. */
export const GET = staffRoute({ permission: 'program.edit', query: programImpactQuery }, async ({ query }): Promise<ProgramImpactDto> => previewProgramImpact(db(), query.total));
