import { findVoucherByCode } from '@/server/domain/vouchers';
import { toVoucherDto } from '@/server/domain/dto';
import { staffRoute } from '@/server/http';
import { voucherCodeQuery } from '@/lib/contracts/schemas';
import type { VoucherLookupDto } from '@/lib/contracts/dto';

/** Look a voucher up by the code under its QR, without opening the customer first (CA-12). Shows used and expired vouchers too, so the cashier can say why it is refused. */
export const GET = staffRoute({ permission: 'counter.work', query: voucherCodeQuery }, async ({ query }): Promise<VoucherLookupDto> => {
  const voucher = await findVoucherByCode(query.code);
  return { voucher: toVoucherDto(voucher, new Date()), customer: { id: voucher.customer.id, name: voucher.customer.name, memberNo: voucher.customer.memberNo } };
});
