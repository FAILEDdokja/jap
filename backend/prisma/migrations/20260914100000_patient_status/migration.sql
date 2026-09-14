-- Phase 4 (patients): lifecycle status on the demographic record.
-- `provisional` = walk-in / emergency intake with minimal demographics;
-- `registered` = complete record. ABHA linkage stays out of this column —
-- it is derived from verified rows in `patient_identities` (doc 04 §3).

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('provisional', 'registered');

-- AlterTable: existing rows are complete records by definition.
ALTER TABLE "patients" ADD COLUMN "status" "PatientStatus" NOT NULL DEFAULT 'registered';
