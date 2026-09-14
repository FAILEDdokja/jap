-- Phase 2 database init migration.
--
-- Generated to mirror prisma/schema.prisma exactly (the schema is the source
-- of truth; regenerate with `npx prisma migrate dev` if it ever drifts).
-- Conventions: opaque UUIDv4 PKs, tenant `organization_id` on every
-- tenant-sensitive table, calendar DATE for clinical dates, TIMESTAMPTZ for
-- audit/moments, hash-chained append-only audit trail.

-- ────────────────────────────────────────────────────────────────────────────
-- Enumerations
-- ────────────────────────────────────────────────────────────────────────────

CREATE TYPE "Role" AS ENUM ('PATIENT', 'DOCTOR', 'HOSPITAL_ADMIN', 'LAB', 'PHARMACY', 'SUPER_ADMIN');
CREATE TYPE "OrgType" AS ENUM ('hospital', 'lab', 'pharmacy', 'platform');
CREATE TYPE "Gender" AS ENUM ('Male', 'Female', 'Other');
CREATE TYPE "EncounterSetting" AS ENUM ('OPD', 'IPD', 'Emergency', 'Teleconsult');
CREATE TYPE "PatientIdentityType" AS ENUM ('ABHA_NUMBER', 'ABHA_ADDRESS');
CREATE TYPE "ClinicalRecordKind" AS ENUM ('ALLERGY', 'CONDITION', 'MEDICATION', 'NOTE', 'VITAL', 'OBSERVATION');
CREATE TYPE "DiagnosisStatus" AS ENUM ('active', 'resolved');
CREATE TYPE "PrescriptionStatus" AS ENUM ('issued', 'partially_dispensed', 'dispensed', 'cancelled');
CREATE TYPE "LabOrderStatus" AS ENUM ('ordered', 'collected', 'in_progress', 'resulted', 'cancelled');
CREATE TYPE "LabPriority" AS ENUM ('routine', 'urgent');
CREATE TYPE "ConsentStatus" AS ENUM ('pending', 'approved', 'denied', 'expired', 'revoked');
CREATE TYPE "ConsentRecordStatus" AS ENUM ('requested', 'granted', 'revoked', 'expired', 'errored');
CREATE TYPE "AccessRequestStatus" AS ENUM ('pending', 'granted', 'denied', 'expired');
CREATE TYPE "AccessDecisionResult" AS ENUM ('granted', 'denied');
CREATE TYPE "AuditStatus" AS ENUM ('success', 'blocked');
CREATE TYPE "AbdmTransactionType" AS ENUM ('AUTH_INIT', 'AUTH_CONFIRM', 'ABHA_VERIFY', 'CONSENT_REQUEST', 'CONSENT_FETCH', 'HI_REQUEST', 'HI_FETCH');
CREATE TYPE "AbdmTransactionStatus" AS ENUM ('initiated', 'otp_required', 'verified', 'completed', 'failed', 'expired', 'cancelled');
CREATE TYPE "AbdmIdentityType" AS ENUM ('ABHA', 'HPID', 'FACILITY_ID');
CREATE TYPE "AbdmIdentityStatus" AS ENUM ('active', 'inactive');
CREATE TYPE "CareContextStatus" AS ENUM ('active', 'linked', 'unlinked');
CREATE TYPE "NotificationKind" AS ENUM ('consent', 'lab', 'task', 'prescription', 'system');
CREATE TYPE "CareTaskType" AS ENUM ('lab_order', 'referral', 'follow_up', 'medication_review', 'general');
CREATE TYPE "CareTaskPriority" AS ENUM ('low', 'normal', 'high');
CREATE TYPE "CareTaskStatus" AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

-- ────────────────────────────────────────────────────────────────────────────
-- Tables
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrgType" NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "facility_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "org_id" UUID,
    "title" TEXT,
    "phone" TEXT,
    "patient_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "Role",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "dob" DATE NOT NULL,
    "blood_group" TEXT,
    "height_cm" DECIMAL(5,2),
    "weight_kg" DECIMAL(5,2),
    "contact_phone" TEXT,
    "contact_address" TEXT,
    "contact_email" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_relation" TEXT,
    "emergency_contact_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "patient_identities" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "type" "PatientIdentityType" NOT NULL,
    "value" TEXT NOT NULL,
    "masked" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "encounters" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "facility_name" TEXT,
    "date" DATE NOT NULL,
    "setting" "EncounterSetting" NOT NULL,
    "clinician_id" UUID,
    "clinician_name" TEXT,
    "reason" TEXT,
    "assessment" TEXT,
    "disposition" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clinical_records" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "encounter_id" UUID,
    "kind" "ClinicalRecordKind" NOT NULL,
    "title" TEXT,
    "detail" TEXT,
    "onset_date" DATE,
    "recorded_by_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "diagnoses" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "encounter_id" UUID,
    "label" TEXT NOT NULL,
    "code" TEXT,
    "date" DATE NOT NULL,
    "status" "DiagnosisStatus" NOT NULL DEFAULT 'active',
    "clinician_id" UUID,
    "clinician_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prescriptions" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "encounter_id" UUID,
    "issued_on" DATE NOT NULL,
    "prescriber_id" UUID,
    "prescriber_name" TEXT,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'issued',
    "notes" TEXT,
    "dispensed_by_org_id" UUID,
    "dispensed_by_name" TEXT,
    "dispensed_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prescription_items" (
    "id" UUID NOT NULL,
    "prescription_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lab_orders" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "ordered_by_org_id" UUID NOT NULL,
    "ordered_by_name" TEXT,
    "performing_org_id" UUID NOT NULL,
    "ordered_by_id" UUID,
    "test" TEXT NOT NULL,
    "panel" TEXT,
    "priority" "LabPriority" NOT NULL DEFAULT 'routine',
    "ordered_on" DATE NOT NULL,
    "status" "LabOrderStatus" NOT NULL DEFAULT 'ordered',
    "collected_on" DATE,
    "resulted_on" DATE,
    "result_summary" TEXT,
    "result_value" TEXT,
    "unit" TEXT,
    "reference_range" TEXT,
    "abnormal" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lab_results" (
    "id" UUID NOT NULL,
    "lab_order_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "test" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "reference_range" TEXT,
    "abnormal" BOOLEAN,
    "as_of" DATE NOT NULL,
    "numeric_value" DECIMAL(18,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "procedures" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "encounter_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "performed_on" DATE NOT NULL,
    "note" TEXT,
    "clinician_id" UUID,
    "clinician_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "requesting_org_id" UUID NOT NULL,
    "requesting_user_id" UUID NOT NULL,
    "requesting_user_name" TEXT,
    "purpose" TEXT NOT NULL,
    "scope" TEXT[],
    "hi_types" TEXT[],
    "requested_on" DATE NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'pending',
    "decided_on" DATE,
    "expires_on" DATE,
    "decided_by_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "consent_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "abdm_consent_id" TEXT,
    "status" "ConsentRecordStatus" NOT NULL DEFAULT 'requested',
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "abdm_transaction_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "access_requests" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "requesting_user_id" UUID NOT NULL,
    "requesting_org_id" UUID NOT NULL,
    "consent_id" UUID,
    "purpose" TEXT NOT NULL,
    "hi_types" TEXT[],
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'pending',
    "requested_on" TIMESTAMP(3) NOT NULL,
    "decided_on" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "access_decisions" (
    "id" UUID NOT NULL,
    "access_request_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "patient_id" UUID,
    "result" "AccessDecisionResult" NOT NULL,
    "reason" TEXT NOT NULL,
    "decided_by_id" UUID,
    "consent_id" UUID,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "actor_name" TEXT,
    "actor_role" "Role",
    "org_id" UUID,
    "org_name" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "patient_id" UUID,
    "status" "AuditStatus" NOT NULL,
    "detail" TEXT,
    "prev_event_id" UUID,
    "hash" TEXT NOT NULL,
    "ts" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_proofs" (
    "id" UUID NOT NULL,
    "first_event_id" UUID NOT NULL,
    "last_event_id" UUID NOT NULL,
    "root_hash" TEXT NOT NULL,
    "chain" TEXT,
    "tx_hash" TEXT,
    "block_number" BIGINT,
    "anchored_at" TIMESTAMPTZ(6),
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_proofs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "abdm_transactions" (
    "id" UUID NOT NULL,
    "request_id" TEXT NOT NULL,
    "abdm_txn_id" TEXT,
    "type" "AbdmTransactionType" NOT NULL,
    "status" "AbdmTransactionStatus" NOT NULL DEFAULT 'initiated',
    "identifier_ref" TEXT,
    "masked_identifier" TEXT,
    "otp_hash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6),
    "user_id" UUID,
    "org_id" UUID,
    "patient_id" UUID,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "abdm_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "abdm_identities" (
    "id" UUID NOT NULL,
    "type" "AbdmIdentityType" NOT NULL,
    "value" TEXT NOT NULL,
    "patient_id" UUID,
    "user_id" UUID,
    "org_id" UUID,
    "status" "AbdmIdentityStatus" NOT NULL DEFAULT 'active',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(6),
    "source_registry" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "abdm_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "care_contexts" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "reference_number" TEXT NOT NULL,
    "hip_id" TEXT,
    "hi_type" TEXT,
    "status" "CareContextStatus" NOT NULL DEFAULT 'active',
    "linked_at" TIMESTAMPTZ(6),
    "unlinked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_contexts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "audience_user_id" UUID,
    "audience_org_id" UUID,
    "audience_role" "Role",
    "org_id" UUID,
    "patient_id" UUID,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "href" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "care_tasks" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "type" "CareTaskType" NOT NULL,
    "priority" "CareTaskPriority" NOT NULL DEFAULT 'normal',
    "assignee_org_id" UUID NOT NULL,
    "assignee_role" "Role" NOT NULL,
    "created_by_id" UUID,
    "created_by_name" TEXT,
    "status" "CareTaskStatus" NOT NULL DEFAULT 'pending',
    "created_on" DATE NOT NULL,
    "due_on" DATE,
    "completed_on" DATE,
    "linked_order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_tasks_pkey" PRIMARY KEY ("id")
);

-- ────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "Organization_code_key" ON "organizations"("code");
CREATE UNIQUE INDEX "Organization_facility_id_key" ON "organizations"("facility_id");

CREATE UNIQUE INDEX "User_email_key" ON "users"("email");
CREATE UNIQUE INDEX "User_patient_id_key" ON "users"("patient_id");
CREATE INDEX "User_org_id_idx" ON "users"("org_id");
CREATE INDEX "User_role_idx" ON "users"("role");

CREATE UNIQUE INDEX "OrganizationMember_org_id_user_id_key" ON "organization_members"("org_id", "user_id");
CREATE INDEX "OrganizationMember_user_id_idx" ON "organization_members"("user_id");

CREATE INDEX "Patient_org_id_idx" ON "patients"("org_id");
CREATE INDEX "Patient_name_idx" ON "patients"("name");
CREATE INDEX "Patient_dob_idx" ON "patients"("dob");

CREATE UNIQUE INDEX "PatientIdentity_type_value_key" ON "patient_identities"("type", "value");
CREATE INDEX "PatientIdentity_patient_id_idx" ON "patient_identities"("patient_id");
CREATE INDEX "PatientIdentity_org_id_idx" ON "patient_identities"("org_id");

CREATE INDEX "Encounter_patient_id_date_idx" ON "encounters"("patient_id", "date");
CREATE INDEX "Encounter_org_id_idx" ON "encounters"("org_id");
CREATE INDEX "Encounter_clinician_id_idx" ON "encounters"("clinician_id");

CREATE INDEX "ClinicalRecord_patient_id_kind_idx" ON "clinical_records"("patient_id", "kind");
CREATE INDEX "ClinicalRecord_org_id_idx" ON "clinical_records"("org_id");
CREATE INDEX "ClinicalRecord_encounter_id_idx" ON "clinical_records"("encounter_id");

CREATE INDEX "Diagnosis_patient_id_idx" ON "diagnoses"("patient_id");
CREATE INDEX "Diagnosis_org_id_idx" ON "diagnoses"("org_id");
CREATE INDEX "Diagnosis_encounter_id_idx" ON "diagnoses"("encounter_id");

CREATE INDEX "Prescription_patient_id_idx" ON "prescriptions"("patient_id");
CREATE INDEX "Prescription_org_id_idx" ON "prescriptions"("org_id");
CREATE INDEX "Prescription_encounter_id_idx" ON "prescriptions"("encounter_id");
CREATE INDEX "Prescription_prescriber_id_idx" ON "prescriptions"("prescriber_id");
CREATE INDEX "Prescription_status_idx" ON "prescriptions"("status");

CREATE INDEX "PrescriptionItem_prescription_id_idx" ON "prescription_items"("prescription_id");

CREATE INDEX "LabOrder_patient_id_idx" ON "lab_orders"("patient_id");
CREATE INDEX "LabOrder_ordered_by_org_id_idx" ON "lab_orders"("ordered_by_org_id");
CREATE INDEX "LabOrder_performing_org_id_idx" ON "lab_orders"("performing_org_id");
CREATE INDEX "LabOrder_status_idx" ON "lab_orders"("status");
CREATE INDEX "LabOrder_ordered_on_idx" ON "lab_orders"("ordered_on");

CREATE INDEX "LabResult_lab_order_id_idx" ON "lab_results"("lab_order_id");
CREATE INDEX "LabResult_patient_id_idx" ON "lab_results"("patient_id");
CREATE INDEX "LabResult_org_id_idx" ON "lab_results"("org_id");
CREATE INDEX "LabResult_as_of_idx" ON "lab_results"("as_of");

CREATE INDEX "Procedure_patient_id_idx" ON "procedures"("patient_id");
CREATE INDEX "Procedure_org_id_idx" ON "procedures"("org_id");
CREATE INDEX "Procedure_encounter_id_idx" ON "procedures"("encounter_id");

CREATE INDEX "Consent_patient_id_requesting_org_id_status_idx" ON "consents"("patient_id", "requesting_org_id", "status");
CREATE INDEX "Consent_requesting_org_id_idx" ON "consents"("requesting_org_id");
CREATE INDEX "Consent_requesting_user_id_idx" ON "consents"("requesting_user_id");
CREATE INDEX "Consent_status_idx" ON "consents"("status");
CREATE INDEX "Consent_expires_on_idx" ON "consents"("expires_on");

CREATE UNIQUE INDEX "ConsentRecord_abdm_consent_id_key" ON "consent_records"("abdm_consent_id");
CREATE INDEX "ConsentRecord_consent_id_idx" ON "consent_records"("consent_id");
CREATE INDEX "ConsentRecord_patient_id_idx" ON "consent_records"("patient_id");
CREATE INDEX "ConsentRecord_org_id_idx" ON "consent_records"("org_id");

CREATE INDEX "AccessRequest_patient_id_idx" ON "access_requests"("patient_id");
CREATE INDEX "AccessRequest_requesting_user_id_idx" ON "access_requests"("requesting_user_id");
CREATE INDEX "AccessRequest_requesting_org_id_idx" ON "access_requests"("requesting_org_id");
CREATE INDEX "AccessRequest_status_idx" ON "access_requests"("status");
CREATE INDEX "AccessRequest_consent_id_idx" ON "access_requests"("consent_id");

CREATE INDEX "AccessDecision_access_request_id_idx" ON "access_decisions"("access_request_id");
CREATE INDEX "AccessDecision_org_id_idx" ON "access_decisions"("org_id");
CREATE INDEX "AccessDecision_patient_id_idx" ON "access_decisions"("patient_id");
CREATE INDEX "AccessDecision_decided_by_id_idx" ON "access_decisions"("decided_by_id");
CREATE INDEX "AccessDecision_consent_id_idx" ON "access_decisions"("consent_id");

CREATE UNIQUE INDEX "AuditEvent_sequence_key" ON "audit_events"("sequence");
CREATE UNIQUE INDEX "AuditEvent_prev_event_id_key" ON "audit_events"("prev_event_id");
CREATE INDEX "AuditEvent_actor_id_idx" ON "audit_events"("actor_id");
CREATE INDEX "AuditEvent_org_id_idx" ON "audit_events"("org_id");
CREATE INDEX "AuditEvent_patient_id_idx" ON "audit_events"("patient_id");
CREATE INDEX "AuditEvent_action_idx" ON "audit_events"("action");
CREATE INDEX "AuditEvent_resource_type_resource_id_idx" ON "audit_events"("resource_type", "resource_id");
CREATE INDEX "AuditEvent_ts_idx" ON "audit_events"("ts");

CREATE INDEX "AuditProof_first_event_id_idx" ON "audit_proofs"("first_event_id");
CREATE INDEX "AuditProof_last_event_id_idx" ON "audit_proofs"("last_event_id");
CREATE INDEX "AuditProof_root_hash_idx" ON "audit_proofs"("root_hash");
CREATE INDEX "AuditProof_anchored_at_idx" ON "audit_proofs"("anchored_at");

CREATE UNIQUE INDEX "AbdmTransaction_request_id_key" ON "abdm_transactions"("request_id");
CREATE UNIQUE INDEX "AbdmTransaction_abdm_txn_id_key" ON "abdm_transactions"("abdm_txn_id");
CREATE INDEX "AbdmTransaction_user_id_idx" ON "abdm_transactions"("user_id");
CREATE INDEX "AbdmTransaction_org_id_idx" ON "abdm_transactions"("org_id");
CREATE INDEX "AbdmTransaction_patient_id_idx" ON "abdm_transactions"("patient_id");
CREATE INDEX "AbdmTransaction_status_idx" ON "abdm_transactions"("status");
CREATE INDEX "AbdmTransaction_expires_at_idx" ON "abdm_transactions"("expires_at");

CREATE UNIQUE INDEX "AbdmIdentity_type_value_key" ON "abdm_identities"("type", "value");
CREATE INDEX "AbdmIdentity_patient_id_idx" ON "abdm_identities"("patient_id");
CREATE INDEX "AbdmIdentity_user_id_idx" ON "abdm_identities"("user_id");
CREATE INDEX "AbdmIdentity_org_id_idx" ON "abdm_identities"("org_id");

CREATE UNIQUE INDEX "CareContext_org_id_reference_number_key" ON "care_contexts"("org_id", "reference_number");
CREATE INDEX "CareContext_patient_id_idx" ON "care_contexts"("patient_id");
CREATE INDEX "CareContext_org_id_idx" ON "care_contexts"("org_id");

CREATE INDEX "Notification_audience_user_id_read_idx" ON "notifications"("audience_user_id", "read");
CREATE INDEX "Notification_audience_org_id_idx" ON "notifications"("audience_org_id");
CREATE INDEX "Notification_audience_role_idx" ON "notifications"("audience_role");
CREATE INDEX "Notification_org_id_idx" ON "notifications"("org_id");
CREATE INDEX "Notification_created_at_idx" ON "notifications"("created_at");

CREATE INDEX "CareTask_patient_id_idx" ON "care_tasks"("patient_id");
CREATE INDEX "CareTask_org_id_idx" ON "care_tasks"("org_id");
CREATE INDEX "CareTask_assignee_org_id_idx" ON "care_tasks"("assignee_org_id");
CREATE INDEX "CareTask_status_idx" ON "care_tasks"("status");
CREATE INDEX "CareTask_due_on_idx" ON "care_tasks"("due_on");

-- ────────────────────────────────────────────────────────────────────────────
-- Foreign keys
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "patients" ADD CONSTRAINT "patients_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "patient_identities" ADD CONSTRAINT "patient_identities_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_identities" ADD CONSTRAINT "patient_identities_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_clinician_id_fkey" FOREIGN KEY ("clinician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_clinician_id_fkey" FOREIGN KEY ("clinician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_prescriber_id_fkey" FOREIGN KEY ("prescriber_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_ordered_by_org_id_fkey" FOREIGN KEY ("ordered_by_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_performing_org_id_fkey" FOREIGN KEY ("performing_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_ordered_by_id_fkey" FOREIGN KEY ("ordered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "lab_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "procedures" ADD CONSTRAINT "procedures_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_clinician_id_fkey" FOREIGN KEY ("clinician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "consents" ADD CONSTRAINT "consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consents" ADD CONSTRAINT "consents_requesting_org_id_fkey" FOREIGN KEY ("requesting_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consents" ADD CONSTRAINT "consents_requesting_user_id_fkey" FOREIGN KEY ("requesting_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consents" ADD CONSTRAINT "consents_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "consents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_abdm_transaction_id_fkey" FOREIGN KEY ("abdm_transaction_id") REFERENCES "abdm_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requesting_user_id_fkey" FOREIGN KEY ("requesting_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requesting_org_id_fkey" FOREIGN KEY ("requesting_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "consents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "access_decisions" ADD CONSTRAINT "access_decisions_access_request_id_fkey" FOREIGN KEY ("access_request_id") REFERENCES "access_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "access_decisions" ADD CONSTRAINT "access_decisions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_decisions" ADD CONSTRAINT "access_decisions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "access_decisions" ADD CONSTRAINT "access_decisions_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "access_decisions" ADD CONSTRAINT "access_decisions_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "consents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_prev_event_id_fkey" FOREIGN KEY ("prev_event_id") REFERENCES "audit_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_proofs" ADD CONSTRAINT "audit_proofs_first_event_id_fkey" FOREIGN KEY ("first_event_id") REFERENCES "audit_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_proofs" ADD CONSTRAINT "audit_proofs_last_event_id_fkey" FOREIGN KEY ("last_event_id") REFERENCES "audit_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "abdm_transactions" ADD CONSTRAINT "abdm_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "abdm_transactions" ADD CONSTRAINT "abdm_transactions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "abdm_transactions" ADD CONSTRAINT "abdm_transactions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "abdm_identities" ADD CONSTRAINT "abdm_identities_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "abdm_identities" ADD CONSTRAINT "abdm_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "abdm_identities" ADD CONSTRAINT "abdm_identities_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "care_contexts" ADD CONSTRAINT "care_contexts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "care_contexts" ADD CONSTRAINT "care_contexts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_audience_user_id_fkey" FOREIGN KEY ("audience_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_audience_org_id_fkey" FOREIGN KEY ("audience_org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "care_tasks" ADD CONSTRAINT "care_tasks_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "care_tasks" ADD CONSTRAINT "care_tasks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "care_tasks" ADD CONSTRAINT "care_tasks_assignee_org_id_fkey" FOREIGN KEY ("assignee_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "care_tasks" ADD CONSTRAINT "care_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
