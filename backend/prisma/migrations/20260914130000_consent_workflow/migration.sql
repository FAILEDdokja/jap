ALTER TYPE "ConsentStatus" RENAME VALUE 'pending' TO 'REQUESTED';
ALTER TYPE "ConsentStatus" RENAME VALUE 'approved' TO 'APPROVED';
ALTER TYPE "ConsentStatus" RENAME VALUE 'denied' TO 'REJECTED';
ALTER TYPE "ConsentStatus" RENAME VALUE 'revoked' TO 'REVOKED';
ALTER TYPE "ConsentStatus" RENAME VALUE 'expired' TO 'EXPIRED';

ALTER TABLE "consents"
  ADD COLUMN "valid_from" DATE,
  ADD COLUMN "revoked_at" TIMESTAMPTZ;

UPDATE "consents"
  SET "valid_from" = "requested_on"
  WHERE "valid_from" IS NULL;

ALTER TABLE "consents"
  ALTER COLUMN "valid_from" SET NOT NULL;
