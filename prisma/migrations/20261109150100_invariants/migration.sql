-- Rules the Prisma schema language cannot express: CHECK constraints, partial indexes, immutability triggers
-- and the reference row every environment needs. Product policy (which values are allowed, for example 4 to 20
-- stamps per card) stays in the application; the database only guards the structure and the audit trail.

-- ---------------------------------------------------------------------------------------------
-- Program: exactly one row, with sane ranges
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "Program"
  ADD CONSTRAINT "Program_singleton" CHECK ("id" = 1),
  ADD CONSTRAINT "Program_stampsRequired_range" CHECK ("stampsRequired" BETWEEN 1 AND 100),
  ADD CONSTRAINT "Program_dailyLimit_nonneg" CHECK ("dailyLimit" >= 0),
  ADD CONSTRAINT "Program_expiryDays_nonneg" CHECK ("expiryDays" >= 0),
  ADD CONSTRAINT "Program_minPurchase_nonneg" CHECK ("minPurchase" >= 0),
  ADD CONSTRAINT "Program_rewardItems_not_empty" CHECK (cardinality("rewardItems") >= 1);

-- The default program (business documentation, section 7). Management edits it from the Loyalty card screen.
INSERT INTO "Program" ("id", "nameBn", "nameEn", "stampsRequired", "rewardItems", "minPurchase", "dailyLimit", "expiryDays", "welcomeBonus", "cardColor", "version", "updatedAt")
VALUES (1, 'লয়্যালটি কার্ড', 'Loyalty card', 10, ARRAY['bubble-tea', 'scoop', 'milkshake'], 200, 2, 90, true, 'lime', 1, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- Phone numbers: E.164. A customer who asked for deletion (BR-25) has the number wiped, so the check is skipped for them.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_phone_e164" CHECK ("deletedAt" IS NOT NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$');

ALTER TABLE "Staff"
  ADD CONSTRAINT "Staff_phone_e164" CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT "Staff_failedPinAttempts_nonneg" CHECK ("failedPinAttempts" >= 0);

-- ---------------------------------------------------------------------------------------------
-- Card counters never go negative
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "Card"
  ADD CONSTRAINT "Card_counters_nonneg" CHECK ("stamps" >= 0 AND "visits" >= 0 AND "lifetimeStamps" >= 0 AND "rewardsEarned" >= 0);

-- ---------------------------------------------------------------------------------------------
-- Stamp ledger
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "StampEntry"
  ADD CONSTRAINT "StampEntry_count_nonzero" CHECK ("count" <> 0),
  ADD CONSTRAINT "StampEntry_stampsAfter_nonneg" CHECK ("stampsAfter" >= 0),
  ADD CONSTRAINT "StampEntry_completedCards_nonneg" CHECK ("completedCards" >= 0),
  ADD CONSTRAINT "StampEntry_adjustment_needs_reason" CHECK ("source" <> 'ADJUSTMENT' OR length(btrim(COALESCE("reason", ''))) > 0),
  ADD CONSTRAINT "StampEntry_purchase_needs_outlet" CHECK ("source" <> 'PURCHASE' OR "branchId" IS NOT NULL),
  ADD CONSTRAINT "StampEntry_not_self_reversal" CHECK ("reversesId" IS NULL OR "reversesId" <> "id");

-- ---------------------------------------------------------------------------------------------
-- Vouchers
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "Voucher"
  ADD CONSTRAINT "Voucher_expiry_after_issue" CHECK ("expiresAt" > "issuedAt"),
  ADD CONSTRAINT "Voucher_redemption_is_attributed" CHECK (("redeemedAt" IS NULL) = ("redeemedById" IS NULL)),
  ADD CONSTRAINT "Voucher_card_source_has_consumption" CHECK ("source" <> 'CARD' OR COALESCE("stampsConsumed", 0) > 0),
  ADD CONSTRAINT "Voucher_offer_source_has_offer" CHECK ("source" <> 'OFFER' OR "offerId" IS NOT NULL);

-- Vouchers waiting to be used: the wallet, the "reward ready" group and the cashier's code lookup all read these.
CREATE INDEX "Voucher_unredeemed_idx" ON "Voucher" ("customerId", "expiresAt") WHERE "redeemedAt" IS NULL;

-- ---------------------------------------------------------------------------------------------
-- Offers
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_stamp_has_bonus" CHECK ("kind" <> 'STAMP' OR COALESCE("bonusStamps", 0) > 0),
  ADD CONSTRAINT "Offer_voucher_has_reward" CHECK ("kind" <> 'VOUCHER' OR ("rewardBn" IS NOT NULL AND "rewardEn" IS NOT NULL AND COALESCE("voucherDays", 0) > 0)),
  ADD CONSTRAINT "Offer_ends_after_start" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");

-- ---------------------------------------------------------------------------------------------
-- Sign-in
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "Session"
  ADD CONSTRAINT "Session_exactly_one_subject" CHECK (("customerId" IS NULL) <> ("staffId" IS NULL));

ALTER TABLE "OtpChallenge"
  ADD CONSTRAINT "OtpChallenge_attempts_nonneg" CHECK ("attempts" >= 0),
  ADD CONSTRAINT "OtpChallenge_staff_login_has_staff" CHECK ("purpose" <> 'STAFF_LOGIN' OR "staffId" IS NOT NULL);

-- ---------------------------------------------------------------------------------------------
-- Append-only tables (CA-19, MG-23): the stamp ledger and the audit log can be added to, never changed.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION "forbid_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on "%" is not allowed: the table is append-only', TG_OP, TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "StampEntry_append_only" BEFORE UPDATE OR DELETE ON "StampEntry"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();

CREATE TRIGGER "AuditLog_append_only" BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();

-- ---------------------------------------------------------------------------------------------
-- Vouchers: never deleted, final once redeemed, and the snapshot fields never change (BR-08, BR-14)
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION "voucher_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'vouchers cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF OLD."redeemedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'voucher % was already redeemed and cannot change', OLD."id" USING ERRCODE = '55000';
  END IF;
  IF NEW."code" IS DISTINCT FROM OLD."code"
     OR NEW."customerId" IS DISTINCT FROM OLD."customerId"
     OR NEW."source" IS DISTINCT FROM OLD."source"
     OR NEW."titleBn" IS DISTINCT FROM OLD."titleBn"
     OR NEW."titleEn" IS DISTINCT FROM OLD."titleEn"
     OR NEW."choices" IS DISTINCT FROM OLD."choices"
     OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt" THEN
    RAISE EXCEPTION 'voucher % keeps the code, owner, title and items it was issued with', OLD."id" USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Voucher_guard" BEFORE UPDATE OR DELETE ON "Voucher"
  FOR EACH ROW EXECUTE FUNCTION "voucher_guard"();
