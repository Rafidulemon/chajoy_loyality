import { db } from '@/server/db';
import { walletFor } from '@/server/domain/views';
import { customerRoute } from '@/server/http';
import type { WalletDto } from '@/lib/contracts/dto';

/** Everything the customer app shows in one response: card, vouchers, live offers and the program. */
export const GET = customerRoute({}, async ({ customer }): Promise<WalletDto> => walletFor(db(), customer.customerId, new Date()));
