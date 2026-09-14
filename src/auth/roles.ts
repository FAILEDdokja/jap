import type { Role } from "@/data/types";
import {
  LayoutDashboard, Users, ShieldCheck, ClipboardList, FlaskConical,
  Pill, ScrollText, Building2, LineChart, HeartPulse, CalendarClock, FileText,
  UserRound, Network,
} from "lucide-react";

export const ROLE_LABEL: Record<Role, string> = {
  PATIENT: "Patient",
  DOCTOR: "Clinician",
  HOSPITAL_ADMIN: "Hospital Admin",
  LAB: "Laboratory",
  PHARMACY: "Pharmacy",
  SUPER_ADMIN: "Platform Admin",
};

export const ROLE_ACCENT: Record<Role, string> = {
  PATIENT: "bg-sky-500/10 text-sky-300 ring-sky-500/25",
  DOCTOR: "bg-brand-500/10 text-brand-300 ring-brand-500/25",
  HOSPITAL_ADMIN: "bg-violet-500/10 text-violet-300 ring-violet-500/25",
  LAB: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
  PHARMACY: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
  SUPER_ADMIN: "bg-white/[0.06] text-zinc-300 ring-white/10",
};

export type NavItem = { to: string; label: string; icon: any; end?: boolean };
export type NavGroup = { section: string; items: NavItem[] };

const G = (section: string, items: NavItem[]): NavGroup => ({ section, items });

export const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  DOCTOR: [
    G("Workspace", [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/app/patients", label: "Patients", icon: Users },
      { to: "/app/consent", label: "Consent requests", icon: ShieldCheck },
      { to: "/app/coordination", label: "Care coordination", icon: Network },
    ]),
    G("Clinical", [
      { to: "/app/lab-orders", label: "Lab orders", icon: FlaskConical },
      { to: "/app/prescriptions", label: "Prescriptions", icon: Pill },
    ]),
    G("Accountability", [{ to: "/app/audit", label: "Access log", icon: ScrollText }]),
  ],
  HOSPITAL_ADMIN: [
    G("Workspace", [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/app/patients", label: "Patients", icon: Users },
      { to: "/app/coordination", label: "Care coordination", icon: Network },
      { to: "/app/consent", label: "Consent register", icon: ShieldCheck },
    ]),
    G("Organization", [
      { to: "/app/staff", label: "Staff", icon: UserRound },
      { to: "/app/analytics", label: "Analytics", icon: LineChart },
      { to: "/app/audit", label: "Audit trail", icon: ScrollText },
    ]),
  ],
  LAB: [
    G("Workspace", [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/app/lab-orders", label: "Order queue", icon: FlaskConical },
      { to: "/app/patients", label: "Patients", icon: Users },
    ]),
    G("Accountability", [{ to: "/app/audit", label: "Activity log", icon: ScrollText }]),
  ],
  PHARMACY: [
    G("Workspace", [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/app/prescriptions", label: "Prescriptions", icon: Pill },
      { to: "/app/patients", label: "Patients", icon: Users },
    ]),
    G("Accountability", [{ to: "/app/audit", label: "Activity log", icon: ScrollText }]),
  ],
  SUPER_ADMIN: [
    G("Platform", [
      { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "/app/organizations", label: "Organizations", icon: Building2 },
      { to: "/app/staff", label: "Users", icon: Users },
    ]),
    G("Insight", [
      { to: "/app/analytics", label: "Platform metrics", icon: LineChart },
      { to: "/app/audit", label: "Audit overview", icon: ScrollText },
    ]),
  ],
  PATIENT: [
    G("My health", [
      { to: "/app", label: "Health overview", icon: HeartPulse, end: true },
      { to: "/app/my-timeline", label: "My timeline", icon: CalendarClock },
      { to: "/app/my-records", label: "My records", icon: FileText },
      { to: "/app/my-care", label: "Care tasks", icon: ClipboardList },
    ]),
    G("Access & control", [
      { to: "/app/my-consents", label: "Consent & access", icon: ShieldCheck },
      { to: "/app/audit", label: "Who accessed my data", icon: ScrollText },
    ]),
  ],
};

export const CAN = {
  createPrescription: (r: Role) => r === "DOCTOR",
  dispensePrescription: (r: Role) => r === "PHARMACY",
  orderLab: (r: Role) => r === "DOCTOR",
  resultLab: (r: Role) => r === "LAB",
  requestConsent: (r: Role) => r === "DOCTOR" || r === "HOSPITAL_ADMIN",
  decideConsent: (r: Role) => r === "PATIENT",
  createTask: (r: Role) => r === "DOCTOR" || r === "HOSPITAL_ADMIN",
  manageStaff: (r: Role) => r === "HOSPITAL_ADMIN" || r === "SUPER_ADMIN",
};
