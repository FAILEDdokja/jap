-- Phase 4.2 — persistent, append-only, hash-chained audit.
--
-- The `audit_events` table already existed (20260914000000_init). This
-- migration turns it into a production audit log:
--
--   1. Opaque *reference* columns (`actor_ref`, `org_ref`, `patient_ref`,
--      `actor_role_ref`) that do not require the acting principal to exist as
--      a row in `users`/`organizations`. The audit writer is deliberately
--      decoupled from the account store: an audit event must be writable even
--      for an actor whose account row was later deleted, and for the current
--      registry-backed demo principals that have no `users` row yet. The UUID
--      foreign keys stay in place for when the account store moves to the
--      database (docs/decisions/0002-audit-failure-policy.md).
--   2. Chain integrity columns: `prev_hash` (the digest of the preceding
--      event) alongside the existing `prev_event_id` linkage.
--   3. Provenance columns: `source_ip` (may be truncated/omitted by policy)
--      and `device_class` (coarse class only — never a device fingerprint).
--   4. Database-enforced append-only semantics: UPDATE and DELETE on
--      `audit_events` raise an exception. The application has no update or
--      delete path at all; these triggers make that structural rather than a
--      convention. Retention deletion is a privileged, out-of-band operation
--      that must disable the trigger explicitly and is itself audited
--      (docs/decisions/0003-audit-retention.md).

ALTER TABLE "audit_events"
  ADD COLUMN IF NOT EXISTS "actor_ref"      TEXT,
  ADD COLUMN IF NOT EXISTS "actor_role_ref" TEXT,
  ADD COLUMN IF NOT EXISTS "org_ref"        TEXT,
  ADD COLUMN IF NOT EXISTS "patient_ref"    TEXT,
  ADD COLUMN IF NOT EXISTS "prev_hash"      TEXT,
  ADD COLUMN IF NOT EXISTS "source_ip"      TEXT,
  ADD COLUMN IF NOT EXISTS "device_class"   TEXT;

CREATE INDEX IF NOT EXISTS "audit_events_actor_ref_idx"   ON "audit_events"("actor_ref");
CREATE INDEX IF NOT EXISTS "audit_events_patient_ref_idx" ON "audit_events"("patient_ref");
CREATE INDEX IF NOT EXISTS "audit_events_org_ref_idx"     ON "audit_events"("org_ref");

-- Append-only enforcement ---------------------------------------------------

CREATE OR REPLACE FUNCTION "audit_events_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'audit_events is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "audit_events_no_update" ON "audit_events";
CREATE TRIGGER "audit_events_no_update"
  BEFORE UPDATE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_append_only"();

DROP TRIGGER IF EXISTS "audit_events_no_delete" ON "audit_events";
CREATE TRIGGER "audit_events_no_delete"
  BEFORE DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_append_only"();

-- Chain constraints ---------------------------------------------------------
-- `hash` is always present; the first event (and only the first) may have a
-- NULL predecessor. `sequence` is already UNIQUE (bigserial) from the init
-- migration, which gives the chain a monotonic total order.

ALTER TABLE "audit_events"
  DROP CONSTRAINT IF EXISTS "audit_events_hash_format";
ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_hash_format" CHECK ("hash" ~ '^[a-f0-9]{64}$');

ALTER TABLE "audit_events"
  DROP CONSTRAINT IF EXISTS "audit_events_prev_link_consistent";
ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_prev_link_consistent" CHECK (
    ("prev_event_id" IS NULL AND "prev_hash" IS NULL)
    OR ("prev_event_id" IS NOT NULL AND "prev_hash" IS NOT NULL)
  );
