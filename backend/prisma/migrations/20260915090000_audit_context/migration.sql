ALTER TABLE "audit_events"
  ADD COLUMN "purpose" TEXT,
  ADD COLUMN "authorization_id" UUID,
  ADD COLUMN "request_id" TEXT;

CREATE INDEX "audit_events_authorization_id_idx" ON "audit_events"("authorization_id");
CREATE INDEX "audit_events_request_id_idx" ON "audit_events"("request_id");
