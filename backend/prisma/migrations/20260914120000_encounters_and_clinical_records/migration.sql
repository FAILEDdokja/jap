CREATE TYPE "EncounterStatus" AS ENUM ('in_progress', 'completed', 'cancelled');

ALTER TABLE "encounters"
  ADD COLUMN "status" "EncounterStatus" NOT NULL DEFAULT 'in_progress';

ALTER TYPE "ClinicalRecordKind" ADD VALUE 'CONSULTATION';
ALTER TYPE "ClinicalRecordKind" ADD VALUE 'DIAGNOSIS';
ALTER TYPE "ClinicalRecordKind" ADD VALUE 'PRESCRIPTION';
ALTER TYPE "ClinicalRecordKind" ADD VALUE 'LAB_ORDER';
ALTER TYPE "ClinicalRecordKind" ADD VALUE 'LAB_RESULT';
ALTER TYPE "ClinicalRecordKind" ADD VALUE 'PROCEDURE';
ALTER TYPE "ClinicalRecordKind" ADD VALUE 'ADMISSION';
ALTER TYPE "ClinicalRecordKind" ADD VALUE 'DISCHARGE';
ALTER TYPE "ClinicalRecordKind" ADD VALUE 'IMMUNIZATION';

ALTER TABLE "clinical_records"
  ADD COLUMN "corrects_id" UUID,
  ADD COLUMN "correction_reason" TEXT,
  ADD CONSTRAINT "clinical_records_corrects_id_fkey"
    FOREIGN KEY ("corrects_id") REFERENCES "clinical_records"("id") ON DELETE RESTRICT;

CREATE INDEX "clinical_records_corrects_id_idx" ON "clinical_records"("corrects_id");
