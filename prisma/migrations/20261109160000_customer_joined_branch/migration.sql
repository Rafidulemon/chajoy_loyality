-- The outlet a customer joined at (customers added at the counter), for "which outlets enrol best".
ALTER TABLE "Customer" ADD COLUMN "joinedBranchId" UUID;

CREATE INDEX "Customer_joinedBranchId_idx" ON "Customer"("joinedBranchId");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_joinedBranchId_fkey" FOREIGN KEY ("joinedBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
