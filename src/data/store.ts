/**
 * In-browser data store for Jan Arogya Nexus (DEMO MODE).
 *
 * This is a deliberate, self-contained substitute for the server so the product
 * can be demonstrated end-to-end without a backend. It:
 *   - hydrates from / persists to localStorage (survives reload)
 *   - exposes tenant-aware, consent-aware read helpers
 *   - records an audit event for every sensitive access
 *   - captures lightweight interaction metrics for the research question
 *   - notifies subscribers so the UI stays live
 *
 * When Supabase is configured (src/lib/supabase.ts), the same function surface
 * can be re-implemented against Postgres + RLS without changing callers.
 */
import { buildSeed, SEED_VERSION } from "./seed";
import type {
  Database, Role, Patient, Consent, ConsentStatus, CareTask, CareTaskStatus,
  LabOrder, LabStatus, Prescription, AuditEvent, Notification, Organization, User,
} from "./types";

const LS_KEY = "jan-arogya-nexus:db:v" + SEED_VERSION;
const now = () => new Date().toISOString();
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

function load(): Database {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Database;
  } catch {
    /* ignore corrupt storage */
  }
  return buildSeed();
}

let db: Database = load();
const listeners = new Set<() => void>();
try {
  localStorage.setItem(LS_KEY, JSON.stringify(db));
} catch {
  /* storage may be unavailable */
}

function persist(next: Database) {
  db = next;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* storage may be unavailable (private mode) — app still works in memory */
  }
}

function commit(mutator: (d: Database) => void) {
  const next: Database = structuredClone(db);
  mutator(next);
  persist(next);
  emit();
}

function emit() {
  listeners.forEach((l) => l());
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function resetDemoData() {
  const seed = buildSeed();
  persist(seed);
  metrics.reset();
  emit();
}

/* ------------------------------------------------------------ raw getters --- */
export const getDb = () => db;
export const orgs = () => db.organizations;
export const orgById = (id: string) => db.organizations.find((o) => o.id === id) ?? null;
export const usersAll = () => db.users;
export const userById = (id: string) => db.users.find((u) => u.id === id) ?? null;
export const patientById = (id: string) => db.patients.find((p) => p.id === id) ?? null;

/* ------------------------------------------------------- consent decisions --- */
export type AccessDecision = {
  allowed: boolean;
  reason: "same_tenant" | "consent_active" | "self" | "platform" | "no_consent" | "consent_pending" | "consent_expired" | "consent_revoked" | "consent_denied";
  consent?: Consent;
};

/** Is a consent currently usable (approved and not past expiry)? */
function consentActive(c: Consent): boolean {
  if (c.status !== "approved") return false;
  if (c.expiresOn && new Date(c.expiresOn).getTime() < Date.now()) return false;
  return true;
}

/**
 * Can `actor` see the full clinical context for `patient`?
 * Rules (client-side mirror of what server RLS would enforce):
 *  - SUPER_ADMIN: platform oversight, allowed (still audited)
 *  - PATIENT: only their own record
 *  - Same tenant as the patient's registering org: implicit treatment relationship
 *  - Otherwise: an active (approved, unexpired) consent for the actor's org
 */
export function evaluateAccess(actor: User, patient: Patient): AccessDecision {
  if (actor.role === "SUPER_ADMIN") return { allowed: true, reason: "platform" };
  if (actor.role === "PATIENT") {
    return actor.patientId === patient.id
      ? { allowed: true, reason: "self" }
      : { allowed: false, reason: "no_consent" };
  }
  if (actor.orgId === patient.orgId) return { allowed: true, reason: "same_tenant" };

  const relevant = db.consents
    .filter((c) => c.patientId === patient.id && c.requestingOrgId === actor.orgId)
    .sort((a, b) => b.requestedOn.localeCompare(a.requestedOn));

  const active = relevant.find(consentActive);
  if (active) return { allowed: true, reason: "consent_active", consent: active };

  const latest = relevant[0];
  if (!latest) return { allowed: false, reason: "no_consent" };
  const map: Record<ConsentStatus, AccessDecision["reason"]> = {
    pending: "consent_pending",
    expired: "consent_expired",
    revoked: "consent_revoked",
    denied: "consent_denied",
    approved: "no_consent",
  };
  return { allowed: false, reason: map[latest.status], consent: latest };
}

/* --------------------------------------------------- tenant-scoped queries --- */

/** Patients this actor may list (own tenant + those with any consent history). */
export function visiblePatients(actor: User): Array<Patient & { access: AccessDecision }> {
  let base: Patient[];
  if (actor.role === "SUPER_ADMIN") base = db.patients;
  else if (actor.role === "PATIENT") base = db.patients.filter((p) => p.id === actor.patientId);
  else {
    const consented = new Set(
      db.consents.filter((c) => c.requestingOrgId === actor.orgId).map((c) => c.patientId),
    );
    base = db.patients.filter((p) => p.orgId === actor.orgId || consented.has(p.id));
  }
  return base
    .map((p) => ({ ...p, access: evaluateAccess(actor, p) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function patientBundle(patientId: string) {
  return {
    patient: patientById(patientId),
    diagnoses: db.diagnoses.filter((d) => d.patientId === patientId).sort((a, b) => b.date.localeCompare(a.date)),
    encounters: db.encounters.filter((e) => e.patientId === patientId).sort((a, b) => b.date.localeCompare(a.date)),
    prescriptions: db.prescriptions.filter((r) => r.patientId === patientId).sort((a, b) => b.issuedOn.localeCompare(a.issuedOn)),
    labOrders: db.labOrders.filter((l) => l.patientId === patientId).sort((a, b) => b.orderedOn.localeCompare(a.orderedOn)),
    careTasks: db.careTasks.filter((t) => t.patientId === patientId).sort((a, b) => b.createdOn.localeCompare(a.createdOn)),
    consents: db.consents.filter((c) => c.patientId === patientId).sort((a, b) => b.requestedOn.localeCompare(a.requestedOn)),
  };
}

export type TimelineEvent = {
  id: string;
  date: string;
  type: "encounter" | "prescription" | "lab" | "diagnosis" | "consent" | "task";
  title: string;
  provider: string;
  summary: string;
  status: string;
  tone: "neutral" | "positive" | "warning" | "critical";
};

export function patientTimeline(patientId: string): TimelineEvent[] {
  const b = patientBundle(patientId);
  const ev: TimelineEvent[] = [];
  b.encounters.forEach((e) =>
    ev.push({ id: e.id, date: e.date, type: "encounter", title: `${e.setting} encounter — ${e.reason}`, provider: `${e.clinicianName} · ${e.facilityName}`, summary: e.assessment, status: e.disposition, tone: e.setting === "Emergency" ? "critical" : "neutral" }),
  );
  b.prescriptions.forEach((r) =>
    ev.push({ id: r.id, date: r.issuedOn, type: "prescription", title: `Prescription — ${r.items.length} item${r.items.length > 1 ? "s" : ""}`, provider: r.prescriberName, summary: r.items.map((i) => i.name).join(", "), status: r.status.replace(/_/g, " "), tone: "neutral" }),
  );
  b.labOrders.forEach((l) =>
    ev.push({ id: l.id, date: l.resultedOn || l.collectedOn || l.orderedOn, type: "lab", title: `Lab — ${l.test}`, provider: `${l.orderedByName} → ${orgById(l.performingOrgId)?.name ?? "Lab"}`, summary: l.status === "resulted" ? `${l.resultValue ?? ""} ${l.unit ?? ""} (${l.resultSummary ?? "resulted"})` : `Status: ${l.status.replace(/_/g, " ")}`, status: l.status.replace(/_/g, " "), tone: l.abnormal ? "warning" : l.status === "resulted" ? "positive" : "neutral" }),
  );
  b.diagnoses.forEach((d) =>
    ev.push({ id: d.id, date: d.date, type: "diagnosis", title: `Diagnosis — ${d.label}`, provider: d.clinicianName, summary: d.code ? `ICD-10 ${d.code}` : "Clinical diagnosis", status: d.status, tone: d.status === "active" ? "warning" : "neutral" }),
  );
  b.consents.forEach((c) =>
    ev.push({ id: c.id, date: c.decidedOn || c.requestedOn, type: "consent", title: `Consent ${c.status} — ${orgById(c.requestingOrgId)?.name ?? "Org"}`, provider: c.requestingUserName, summary: c.purpose, status: c.status, tone: c.status === "approved" ? "positive" : c.status === "denied" || c.status === "revoked" ? "critical" : "neutral" }),
  );
  return ev.sort((a, b) => b.date.localeCompare(a.date));
}

/* ---------------------------------------------------------------- audit --- */
export function audit(actor: User, e: Omit<AuditEvent, "id" | "ts" | "actorId" | "actorName" | "actorRole" | "orgId" | "orgName">) {
  const org = orgById(actor.orgId);
  commit((d) => {
    d.audit.unshift({
      id: uid("a"),
      ts: now(),
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      orgId: actor.orgId,
      orgName: org?.name ?? "—",
      ...e,
    });
  });
}

export function auditFeed(actor: User): AuditEvent[] {
  if (actor.role === "SUPER_ADMIN") return db.audit;
  if (actor.role === "PATIENT")
    return db.audit.filter((a) => a.patientId === actor.patientId);
  // hospital/lab/pharmacy: events by their org, or touching a patient they can see
  const seen = new Set(visiblePatients(actor).map((p) => p.id));
  return db.audit.filter((a) => a.orgId === actor.orgId || (a.patientId && seen.has(a.patientId)));
}

/* --------------------------------------------------------- notifications --- */
export function notificationsFor(actor: User): Notification[] {
  return db.notifications
    .filter(
      (n) =>
        n.audienceUserId === actor.id ||
        (n.audienceOrgId === actor.orgId && (!n.audienceRole || n.audienceRole === actor.role)) ||
        (!n.audienceOrgId && !n.audienceUserId && n.audienceRole === actor.role),
    )
    .sort((a, b) => b.createdOn.localeCompare(a.createdOn));
}

export function markNotificationRead(id: string) {
  commit((d) => {
    const n = d.notifications.find((x) => x.id === id);
    if (n) n.read = true;
  });
}
export function markAllNotificationsRead(actor: User) {
  const ids = new Set(notificationsFor(actor).map((n) => n.id));
  commit((d) => d.notifications.forEach((n) => ids.has(n.id) && (n.read = true)));
}

function pushNotification(n: Omit<Notification, "id" | "createdOn" | "read">) {
  commit((d) => d.notifications.unshift({ ...n, id: uid("n"), createdOn: now(), read: false }));
}

/* -------------------------------------------------------------- consents --- */
export function requestConsent(actor: User, input: {
  patientId: string;
  purpose: string;
  scope: string[];
  hiTypes: string[];
  durationDays: number;
}): Consent {
  const c: Consent = {
    id: uid("con"),
    patientId: input.patientId,
    requestingOrgId: actor.orgId,
    requestingUserId: actor.id,
    requestingUserName: actor.name,
    purpose: input.purpose,
    scope: input.scope,
    hiTypes: input.hiTypes,
    requestedOn: now(),
    status: "pending",
    expiresOn: new Date(Date.now() + input.durationDays * 864e5).toISOString(),
  };
  commit((d) => d.consents.unshift(c));
  audit(actor, { action: "consent.request", resourceType: "Consent", resourceId: c.id, patientId: c.patientId, status: "success", detail: `Requested ${input.scope.join(", ")} for ${input.durationDays} days.` });
  const patientUser = db.users.find((u) => u.patientId === input.patientId);
  if (patientUser)
    pushNotification({ audienceUserId: patientUser.id, title: "New access request", body: `${actor.name} (${orgById(actor.orgId)?.name}) is requesting access to your records.`, kind: "consent", href: "/app/my-consents" });
  return c;
}

export function decideConsent(actor: User, consentId: string, decision: "approved" | "denied" | "revoked", note?: string) {
  const c = db.consents.find((x) => x.id === consentId);
  if (!c) return;
  commit((d) => {
    const t = d.consents.find((x) => x.id === consentId)!;
    t.status = decision;
    t.decidedOn = now();
    if (note) t.note = note;
    if (decision === "approved" && !t.expiresOn)
      t.expiresOn = new Date(Date.now() + 90 * 864e5).toISOString();
  });
  audit(actor, { action: `consent.${decision === "approved" ? "approve" : decision === "denied" ? "deny" : "revoke"}`, resourceType: "Consent", resourceId: consentId, patientId: c.patientId, status: "success", detail: note || `Consent ${decision} by ${actor.role === "PATIENT" ? "patient" : actor.name}.` });
  pushNotification({
    audienceUserId: c.requestingUserId,
    title: `Access ${decision}`,
    body: `Your request for ${patientById(c.patientId)?.name}'s records was ${decision}.`,
    kind: "consent",
    href: `/app/patients/${c.patientId}`,
  });
}

/* ------------------------------------------------------------- care tasks --- */
export function tasksFor(actor: User): CareTask[] {
  if (actor.role === "SUPER_ADMIN") return [...db.careTasks].sort(byCreated);
  return db.careTasks
    .filter((t) => t.orgId === actor.orgId || t.assigneeOrgId === actor.orgId)
    .sort(byCreated);
}
const byCreated = (a: CareTask, b: CareTask) => b.createdOn.localeCompare(a.createdOn);

export function createTask(actor: User, input: Omit<CareTask, "id" | "createdOn" | "createdById" | "createdByName" | "orgId" | "status"> & { status?: CareTaskStatus }): CareTask {
  const t: CareTask = {
    ...input,
    id: uid("task"),
    orgId: actor.orgId,
    createdById: actor.id,
    createdByName: actor.name,
    status: input.status ?? "pending",
    createdOn: now(),
  };
  commit((d) => d.careTasks.unshift(t));
  audit(actor, { action: "care.task.create", resourceType: "CareTask", resourceId: t.id, patientId: t.patientId, status: "success", detail: t.title });
  const assigneeOrg = orgById(t.assigneeOrgId);
  pushNotification({ audienceOrgId: t.assigneeOrgId, audienceRole: t.assigneeRole, title: "New care task assigned", body: `${t.title} — for ${patientById(t.patientId)?.name} (${assigneeOrg?.name}).`, kind: "task", href: "/app/coordination" });
  return t;
}

export function advanceTask(actor: User, taskId: string, status: CareTaskStatus) {
  const t = db.careTasks.find((x) => x.id === taskId);
  if (!t) return;
  commit((d) => {
    const x = d.careTasks.find((z) => z.id === taskId)!;
    x.status = status;
    if (status === "completed") x.completedOn = now();
  });
  audit(actor, { action: "care.task.update", resourceType: "CareTask", resourceId: taskId, patientId: t.patientId, status: "success", detail: `Status → ${status.replace(/_/g, " ")}` });
}

/* ------------------------------------------------------------- lab orders --- */
export function labQueueFor(actor: User): LabOrder[] {
  if (actor.role === "SUPER_ADMIN") return [...db.labOrders].sort(byOrdered);
  if (actor.role === "LAB")
    return db.labOrders.filter((l) => l.performingOrgId === actor.orgId).sort(byOrdered);
  return db.labOrders.filter((l) => l.orderedByOrgId === actor.orgId).sort(byOrdered);
}
const byOrdered = (a: LabOrder, b: LabOrder) => b.orderedOn.localeCompare(a.orderedOn);

export function createLabOrder(actor: User, input: { patientId: string; test: string; panel?: string; priority: "routine" | "urgent"; performingOrgId: string }): LabOrder {
  const l: LabOrder = {
    id: uid("lab"),
    patientId: input.patientId,
    orderedByOrgId: actor.orgId,
    orderedByName: actor.name,
    performingOrgId: input.performingOrgId,
    test: input.test,
    panel: input.panel,
    priority: input.priority,
    orderedOn: now(),
    status: "ordered",
  };
  commit((d) => d.labOrders.unshift(l));
  audit(actor, { action: "lab.order.create", resourceType: "LabOrder", resourceId: l.id, patientId: l.patientId, status: "success", detail: `${input.test} (${input.priority})` });
  pushNotification({ audienceOrgId: input.performingOrgId, audienceRole: "LAB", title: "New lab order", body: `${input.test} for ${patientById(input.patientId)?.name} from ${orgById(actor.orgId)?.name}.`, kind: "lab", href: "/app/lab-orders" });
  return l;
}

export function updateLabOrder(actor: User, id: string, patch: Partial<Pick<LabOrder, "status" | "resultSummary" | "resultValue" | "unit" | "referenceRange" | "abnormal">>) {
  const l = db.labOrders.find((x) => x.id === id);
  if (!l) return;
  commit((d) => {
    const x = d.labOrders.find((z) => z.id === id)!;
    Object.assign(x, patch);
    if (patch.status === "collected" && !x.collectedOn) x.collectedOn = now();
    if (patch.status === "resulted") x.resultedOn = now();
  });
  const verb = patch.status === "resulted" ? "lab.result.upload" : "lab.order.update";
  audit(actor, { action: verb, resourceType: "LabOrder", resourceId: id, patientId: l.patientId, status: "success", detail: patch.status === "resulted" ? `${patch.resultValue ?? ""} ${patch.unit ?? ""} — ${patch.resultSummary ?? "resulted"}` : `Status → ${patch.status}` });
  if (patch.status === "resulted")
    pushNotification({ audienceOrgId: l.orderedByOrgId, audienceRole: "DOCTOR", title: "Lab result available", body: `${l.test} for ${patientById(l.patientId)?.name}: ${patch.resultValue ?? ""} ${patch.unit ?? ""}.`, kind: "lab", href: `/app/patients/${l.patientId}` });
}

/* ----------------------------------------------------------- prescriptions --- */
export function prescriptionsFor(actor: User): Prescription[] {
  if (actor.role === "SUPER_ADMIN") return [...db.prescriptions].sort(byIssued);
  if (actor.role === "PHARMACY")
    return [...db.prescriptions].sort(byIssued); // pharmacy sees network prescriptions to fulfil
  return db.prescriptions.filter((r) => r.orgId === actor.orgId).sort(byIssued);
}
const byIssued = (a: Prescription, b: Prescription) => b.issuedOn.localeCompare(a.issuedOn);

export function createPrescription(actor: User, input: { patientId: string; encounterId?: string; items: Prescription["items"]; notes?: string }): Prescription {
  const r: Prescription = {
    id: uid("rx"),
    patientId: input.patientId,
    encounterId: input.encounterId,
    orgId: actor.orgId,
    issuedOn: now(),
    prescriberId: actor.id,
    prescriberName: actor.name,
    items: input.items,
    status: "issued",
    notes: input.notes,
  };
  commit((d) => d.prescriptions.unshift(r));
  audit(actor, { action: "prescription.create", resourceType: "Prescription", resourceId: r.id, patientId: r.patientId, status: "success", detail: `${input.items.length} item(s): ${input.items.map((i) => i.name).join(", ")}` });
  pushNotification({ audienceRole: "PHARMACY", audienceOrgId: undefined, title: "New prescription", body: `${actor.name} issued a prescription for ${patientById(input.patientId)?.name}.`, kind: "prescription", href: "/app/prescriptions" });
  return r;
}

export function dispensePrescription(actor: User, id: string, full: boolean) {
  const r = db.prescriptions.find((x) => x.id === id);
  if (!r) return;
  commit((d) => {
    const x = d.prescriptions.find((z) => z.id === id)!;
    x.status = full ? "dispensed" : "partially_dispensed";
    x.dispensedByOrgId = actor.orgId;
    x.dispensedByName = orgById(actor.orgId)?.name;
    x.dispensedOn = now();
  });
  audit(actor, { action: "prescription.dispense", resourceType: "Prescription", resourceId: id, patientId: r.patientId, status: "success", detail: full ? "Full dispense" : "Partial dispense" });
  pushNotification({ audienceUserId: db.users.find((u) => u.patientId === r.patientId)?.id ?? "", title: "Prescription dispensed", body: `Your prescription was ${full ? "fully" : "partially"} dispensed at ${orgById(actor.orgId)?.name}.`, kind: "prescription", href: "/app/my-records" });
}

/* ------------------------------------------------------- patient registry --- */
export function registerPatient(actor: User, input: {
  name: string;
  gender: Patient["gender"];
  dob: string;
  abhaNumber: string;
  abhaAddress: string;
  abhaVerified: boolean;
  phone: string;
  address: string;
  bloodGroup: string;
}): Patient {
  const p: Patient = {
    id: uid("p"),
    orgId: actor.orgId,
    name: input.name,
    gender: input.gender,
    dob: input.dob,
    abha: { number: input.abhaNumber, address: input.abhaAddress },
    abhaVerified: input.abhaVerified,
    contact: { phone: input.phone, address: input.address },
    emergencyContact: { name: "—", relation: "—", phone: "—" },
    bloodGroup: input.bloodGroup,
    heightCm: 0,
    weightKg: 0,
    chronicConditions: [],
    allergies: [],
    currentMedications: [],
    registeredOn: now(),
  };
  commit((d) => d.patients.push(p));
  audit(actor, { action: "patient.register", resourceType: "Patient", resourceId: p.id, patientId: p.id, status: "success", detail: `Registered ${p.name}${input.abhaVerified ? " with verified ABHA" : ""}.` });
  return p;
}

export function inviteUser(actor: User, input: { name: string; email: string; role: Role; title: string; orgId?: string }): User {
  const u: User = {
    id: uid("u"),
    name: input.name,
    email: input.email,
    role: input.role,
    orgId: input.orgId ?? actor.orgId,
    title: input.title,
  };
  commit((d) => d.users.push(u));
  audit(actor, { action: "staff.invite", resourceType: "User", resourceId: u.id, status: "success", detail: `Invited ${u.name} as ${input.role}.` });
  return u;
}

export function addClinicalNote(actor: User, patientId: string, text: string) {
  audit(actor, { action: "patient.note.add", resourceType: "Patient", resourceId: patientId, patientId, status: "success", detail: text.slice(0, 120) });
  pushNotification({ audienceOrgId: patientById(patientId)?.orgId, audienceRole: "DOCTOR", title: "Clinical note added", body: `${actor.name} added a note to ${patientById(patientId)?.name}.`, kind: "system", href: `/app/patients/${patientId}` });
}

/* -------------------------------------------------- research instrumentation --- */
type MetricSession = {
  patientId: string;
  startedAt: number;
  navSteps: number;
  recordsRevealed: number;
  assembledMs?: number;
};

const METRICS_KEY = "jan-arogya-nexus:metrics:v1";

class Metrics {
  contextRuns: Array<{ patientId: string; assembledMs: number; records: number; steps: number; at: string; crossTenant: boolean }> = [];
  blockedAttempts = 0;
  consentGrants = 0;
  private current: MetricSession | null = null;

  constructor() {
    try {
      const raw = localStorage.getItem(METRICS_KEY);
      if (raw) Object.assign(this, JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }
  private save() {
    try {
      localStorage.setItem(METRICS_KEY, JSON.stringify({ contextRuns: this.contextRuns, blockedAttempts: this.blockedAttempts, consentGrants: this.consentGrants }));
    } catch {
      /* ignore */
    }
  }
  reset() {
    this.contextRuns = [];
    this.blockedAttempts = 0;
    this.consentGrants = 0;
    this.current = null;
    this.save();
  }
  beginContext(patientId: string) {
    this.current = { patientId, startedAt: performance.now(), navSteps: 1, recordsRevealed: 0 };
  }
  countRecords(n: number) {
    if (this.current) this.current.recordsRevealed = n;
  }
  endContext(crossTenant: boolean) {
    if (!this.current) return;
    const assembledMs = Math.round(performance.now() - this.current.startedAt);
    this.recordContextRun(this.current.patientId, assembledMs, this.current.recordsRevealed, crossTenant);
    this.current = null;
  }
  recordContextRun(patientId: string, assembledMs: number, records: number, crossTenant: boolean) {
    this.contextRuns.unshift({ patientId, assembledMs, records, steps: 1, at: now(), crossTenant });
    this.contextRuns = this.contextRuns.slice(0, 50);
    this.save();
    emit();
  }
  recordBlocked() {
    this.blockedAttempts += 1;
    this.save();
    emit();
  }
  recordGrant() {
    this.consentGrants += 1;
    this.save();
    emit();
  }
  summary() {
    const runs = this.contextRuns;
    const avg = runs.length ? Math.round(runs.reduce((s, r) => s + r.assembledMs, 0) / runs.length) : 0;
    const avgRecords = runs.length ? Math.round(runs.reduce((s, r) => s + r.records, 0) / runs.length) : 0;
    return {
      runs: runs.length,
      avgAssembledMs: avg,
      avgRecords,
      blockedAttempts: this.blockedAttempts,
      consentGrants: this.consentGrants,
      recent: runs.slice(0, 8),
    };
  }
}

export const metrics = new Metrics();

/* ----------------------------------------------------- admin-ish summaries --- */
export function orgDirectory() {
  return db.organizations.map((o) => ({
    ...o,
    staff: db.users.filter((u) => u.orgId === o.id).length,
    patients: db.patients.filter((p) => p.orgId === o.id).length,
  }));
}

export function platformStats() {
  return {
    orgs: db.organizations.filter((o) => o.type !== "platform").length,
    users: db.users.length,
    patients: db.patients.length,
    consents: db.consents.length,
    activeConsents: db.consents.filter(consentActive).length,
    pendingConsents: db.consents.filter((c) => c.status === "pending").length,
    auditEvents: db.audit.length,
    blocked: db.audit.filter((a) => a.status === "blocked").length,
  };
}

export type { Organization, User };
