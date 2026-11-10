import { db } from '@/server/db';
import { toMeDto } from '@/server/domain/dto';
import { updateProfile } from '@/server/domain/customers';
import { customerRoute } from '@/server/http';
import { profileUpdate } from '@/lib/contracts/schemas';
import type { MeDto } from '@/lib/contracts/dto';

/** The signed-in customer's profile. */
export const GET = customerRoute({}, async ({ customer }): Promise<MeDto> => toMeDto(await db().customer.findUniqueOrThrow({ where: { id: customer.customerId } })));

/** The setup screen and the profile page: name, birthday, offer SMS consent, language. */
export const PATCH = customerRoute({ body: profileUpdate }, async ({ customer, body }): Promise<MeDto> => toMeDto(await updateProfile(db(), customer.customerId, body)));
