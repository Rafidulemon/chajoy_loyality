import { db } from '@/server/db';
import { exportCustomersCsv } from '@/server/domain/admin-customers';
import { staffContext, writeAudit } from '@/server/domain/audit';
import { getProgram } from '@/server/domain/program';
import { staffRoute } from '@/server/http';
import { adminCustomersQuery } from '@/lib/contracts/schemas';

/** The filtered customer list as a CSV file. Owner only (BR-25), and every export is written to the audit log. */
export const GET = staffRoute({ permission: 'customers.export', query: adminCustomersQuery }, async ({ staff, query, requestId }) => {
  const now = new Date();
  const program = await getProgram(db());
  const csv = await exportCustomersCsv(db(), { segment: query.segment, q: query.q, now, stampsPerCard: program.stampsRequired });
  await db().$transaction((tx) => writeAudit(tx, staffContext(staff, requestId), { action: 'customers.export', entityType: 'Customer', after: { segment: query.segment, search: query.q ?? null, rows: csv.split('\r\n').length - 2 }, at: now }));
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="chajoy-customers.csv"', 'Cache-Control': 'private, no-store' },
  });
});
