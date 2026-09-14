/** Core domain model for Jan Arogya Nexus (tenant-aware healthcare coordination). */

export type Role =
  | "PATIENT"
  | "DOCTOR"
  | "HOSPITAL_ADMIN"
  | "LAB"
  | "PHARMACY"
  | "SUPER_ADMIN";

export type OrgType = "hospital" | "lab" | "pharmacy" | "platform";

export interface Organization {
  id: string;
  name: string;
  type: OrgType;
  code: string;
  city: string;
  state: string;
  createdOn: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  orgId: string;
  title?: string;
  phone?: string;
  /** For PATIENT users: the patient record they own. */
  patientId?: string;
}

export interface Allergy {
  substance: string;
  reaction: string;
  severity?: "mild" | "moderate" | "severe";
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  since?: string;
}

export interface Patient {
  id: string;
  /** Tenant that registered / owns the base demographic record. */
  orgId: string;
  name: string;
  gender: "Male" | "Female" | "Other";
  dob: string;
  abha: { number: string; address: string };
  abhaVerified: boolean;
  contact: { phone: string; address: string; email?: string };
  emergencyContact: { name: string; relation: string; phone: string };
  bloodGroup: string;
  heightCm: number;
  weightKg: number;
  chronicConditions: string[];
  allergies: Allergy[];
  currentMedications: Medication[];
  registeredOn: string;
}

export interface Diagnosis {
  id: string;
  patientId: string;
  orgId: string;
  label: string;
  code?: string;
  date: string;
  status: "active" | "resolved";
  encounterId?: string;
  clinicianName: string;
}

export interface Encounter {
  id: string;
  patientId: string;
  orgId: string;
  facilityName: string;
  date: string;
  setting: "OPD" | "IPD" | "Emergency" | "Teleconsult";
  clinicianId: string;
  clinicianName: string;
  reason: string;
  assessment: string;
  disposition: string;
  notes?: string;
}

export interface PrescriptionItem {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export type PrescriptionStatus = "issued" | "partially_dispensed" | "dispensed" | "cancelled";

export interface Prescription {
  id: string;
  patientId: string;
  encounterId?: string;
  orgId: string;
  issuedOn: string;
  prescriberId: string;
  prescriberName: string;
  items: PrescriptionItem[];
  status: PrescriptionStatus;
  dispensedByOrgId?: string;
  dispensedByName?: string;
  dispensedOn?: string;
  notes?: string;
}

export type LabStatus = "ordered" | "collected" | "in_progress" | "resulted" | "cancelled";

export interface LabOrder {
  id: string;
  patientId: string;
  orderedByOrgId: string;
  orderedByName: string;
  performingOrgId: string;
  test: string;
  panel?: string;
  priority: "routine" | "urgent";
  orderedOn: string;
  status: LabStatus;
  collectedOn?: string;
  resultedOn?: string;
  resultSummary?: string;
  resultValue?: string;
  unit?: string;
  referenceRange?: string;
  abnormal?: boolean;
}

export type ConsentStatus = "pending" | "approved" | "denied" | "expired" | "revoked";

export interface Consent {
  id: string;
  patientId: string;
  requestingOrgId: string;
  requestingUserId: string;
  requestingUserName: string;
  purpose: string;
  scope: string[];
  hiTypes: string[];
  requestedOn: string;
  status: ConsentStatus;
  decidedOn?: string;
  expiresOn?: string;
  note?: string;
}

export type CareTaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type CareTaskType = "lab_order" | "referral" | "follow_up" | "medication_review" | "general";

export interface CareTask {
  id: string;
  patientId: string;
  orgId: string;
  title: string;
  detail: string;
  type: CareTaskType;
  priority: "low" | "normal" | "high";
  assigneeOrgId: string;
  assigneeRole: Role;
  createdById: string;
  createdByName: string;
  status: CareTaskStatus;
  createdOn: string;
  dueOn?: string;
  completedOn?: string;
  linkedOrderId?: string;
}

export interface Notification {
  id: string;
  audienceOrgId?: string;
  audienceRole?: Role;
  audienceUserId?: string;
  title: string;
  body: string;
  kind: "consent" | "lab" | "task" | "prescription" | "system";
  createdOn: string;
  read: boolean;
  href?: string;
}

export type AuditStatus = "success" | "blocked";

export interface AuditEvent {
  id: string;
  ts: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  orgId: string;
  orgName: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  patientId?: string;
  status: AuditStatus;
  detail?: string;
}

export interface Database {
  organizations: Organization[];
  users: User[];
  patients: Patient[];
  diagnoses: Diagnosis[];
  encounters: Encounter[];
  prescriptions: Prescription[];
  labOrders: LabOrder[];
  consents: Consent[];
  careTasks: CareTask[];
  notifications: Notification[];
  audit: AuditEvent[];
}
