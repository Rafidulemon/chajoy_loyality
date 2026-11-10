import { db } from '@/server/db';
import { getAdminProgram, saveProgram } from '@/server/domain/admin-program';
import { staffContext } from '@/server/domain/audit';
import { staffRoute } from '@/server/http';
import { programSave } from '@/lib/contracts/schemas';
import type { AdminProgramDto, ProgramSaveResultDto } from '@/lib/contracts/admin';

/** The program as it stands, plus whether the birthday and double-stamp offers are on. Managers can look; only the owner can change it. */
export const GET = staffRoute({ permission: 'dashboard.view' }, async (): Promise<AdminProgramDto> => getAdminProgram(db()));

/** Save the loyalty program for every customer and outlet (MG-08). Owner only. Send back the `version` you started from. */
export const PUT = staffRoute({ permission: 'program.edit', body: programSave }, async ({ staff, body, requestId }): Promise<ProgramSaveResultDto> =>
  saveProgram({ patch: body, ctx: staffContext(staff, requestId) }));
