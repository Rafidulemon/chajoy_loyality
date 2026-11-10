import { db } from '@/server/db';
import { getProgram, toProgramDto } from '@/server/domain/program';
import { publicRoute } from '@/server/http';
import type { ProgramDto } from '@/lib/contracts/dto';

/**
 * The loyalty program as customers and staff see it (stamps per card, reward items, card colour). Public, but not cached: a
 * change applies to every customer and outlet as soon as it is saved (BR-12), and this is one small row.
 */
export const GET = publicRoute({}, async (): Promise<ProgramDto> => toProgramDto(await getProgram(db())));
