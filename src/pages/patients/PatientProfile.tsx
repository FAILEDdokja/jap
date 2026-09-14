import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, ShieldAlert, ShieldCheck, Clock, Layers, Pill, FlaskConical,
  ClipboardList, StickyNote, AlertTriangle, Activity, Stethoscope, Eye, EyeOff, Building2,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import {
  patientBundle, patientTimeline, evaluateAccess, audit, metrics, getDb, orgById, advanceTask,
} from "@/data/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardBody, Badge, Button, EmptyState, Avatar, SampleTag } from "@/components/ui/primitives";
import { Timeline } from "@/components/Timeline";
import { DataTable } from "@/components/DataTable";
import { ConsentPill, consentLabel } from "@/components/ConsentPill";
import { RequestConsentModal } from "@/components/RequestConsentModal";
import { NewPrescriptionModal, OrderLabModal, NewTaskModal, AddNoteModal } from "./ClinicalActions";
import { fmtDate, fmtDateTime, relative, ageFrom, maskAbha } from "@/lib/format";
import { LAB_STATUS_TONE, RX_STATUS_TONE, TASK_STATUS_TONE } from "@/lib/status";
import { cn } from "@/lib/cn";

type Tab = "overview" | "timeline" | "encounters" | "labs" | "prescriptions" | "tasks";

export default function PatientProfile() {
  useStore();
  const { patientId = "" } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [showRequest, setShowRequest] = useState(false);
  const [showRx, setShowRx] = useState(false);
  const [showLab, setShowLab] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [revealAbha, setRevealAbha] = useState(false);
  const auditedRef = useRef<string>("");
  const renderStart = useRef<number>(performance.now());

  const bundle = patientBundle(patientId);
  const patient = bundle.patient;
  const access = user && patient ? evaluateAccess(user, patient) : null;
  const crossTenant = !!(user && patient && user.orgId !== patient.orgId && user.role !== "SUPER_ADMIN");

  const totalRecords = bundle.diagnoses.length + bundle.encounters.length + bundle.prescriptions.length + bundle.labOrders.length + bundle.careTasks.length;
  const sourceOrgs = useMemo(() => {
    const ids = new Set<string>();
    if (patient) ids.add(patient.orgId);
    bundle.encounters.forEach((e) => ids.add(e.orgId));
    bundle.labOrders.forEach((l) => ids.add(l.performingOrgId));
    bundle.prescriptions.forEach((r) => { ids.add(r.orgId); if (r.dispensedByOrgId) ids.add(r.dispensedByOrgId); });
    return [...ids];
  }, [patient, bundle]);

  // Audit + instrument once per (patient, decision) view
  useEffect(() => {
    if (!user || !patient || !access) return;
    const key = `${patient.id}:${access.reason}`;
    if (auditedRef.current === key) return;
    auditedRef.current = key;

    if (access.allowed) {
      const elapsed = Math.max(1, Math.round(performance.now() - renderStart.current));
      metrics.recordContextRun(patient.id, elapsed, totalRecords, crossTenant);
      audit(user, {
        action: "patient.context.view",
        resourceType: "Patient",
        resourceId: patient.id,
        patientId: patient.id,
        status: "success",
        detail: `Unified clinical context assembled from ${sourceOrgs.length} organization(s)${crossTenant && access.consent ? ` under consent ${access.consent.id}` : ""}.`,
      });
    } else {
      metrics.recordBlocked();
      audit(user, {
        action: "patient.context.view",
        resourceType: "Patient",
        resourceId: patient.id,
        patientId: patient.id,
        status: "blocked",
        detail: `Access denied — ${consentLabel(access.reason)}. No clinical data returned.`,
      });
    }
  }, [user, patient, access?.reason]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!patient) {
    return (
      <div>
        <BackLink />
        <EmptyState icon={<Activity className="h-5 w-5" />} title="Patient not found" description="The record may have been removed or the link is stale." />
      </div>
    );
  }
  if (!user || !access) return null;

  const isDoctor = user.role === "DOCTOR";
  const notes = getDb().audit.filter((a) => a.patientId === patient.id && a.action === "patient.note.add");

  /* ------------------------------------------------------ ACCESS GATE ---- */
  if (!access.allowed) {
    const c = access.consent;
    return (
      <div className="mx-auto max-w-2xl">
        <BackLink />
        <Card>
          <CardBody className="p-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/25">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-zinc-100">{patient.name}</h1>
            <p className="mt-1 text-[13px] text-zinc-400">
              {patient.gender} · {ageFrom(patient.dob)} yrs · registered at {orgById(patient.orgId)?.name}
            </p>
            <div className="mt-4 inline-flex"><ConsentPill decision={access} /></div>
            <p className="mx-auto mt-4 max-w-md text-[13.5px] text-zinc-400">
              This patient is outside your organization's care relationship. Their clinical context stays sealed
              until they grant consent. This attempt has been written to the access log.
            </p>

            {c && (
              <div className="mx-auto mt-5 max-w-md rounded-lg border border-line bg-white/[0.03] p-4 text-left text-[12.5px]">
                <p className="font-semibold text-zinc-100">Most recent request</p>
                <dl className="mt-2 grid grid-cols-[110px_1fr] gap-y-1.5">
                  <dt className="text-zinc-500">Status</dt><dd className="text-zinc-100 capitalize">{c.status}</dd>
                  <dt className="text-zinc-500">Purpose</dt><dd className="text-zinc-100">{c.purpose}</dd>
                  <dt className="text-zinc-500">Requested</dt><dd className="text-zinc-100">{fmtDate(c.requestedOn)} ({relative(c.requestedOn)})</dd>
                  {c.decidedOn && <><dt className="text-zinc-500">Decided</dt><dd className="text-zinc-100">{fmtDate(c.decidedOn)}</dd></>}
                </dl>
              </div>
            )}

            <div className="mt-6 flex justify-center gap-2">
              {(user.role === "DOCTOR" || user.role === "HOSPITAL_ADMIN") && (
                <Button icon={<ShieldCheck className="h-4 w-4" />} onClick={() => setShowRequest(true)}>
                  {c?.status === "pending" ? "Re-send access request" : "Request access"}
                </Button>
              )}
              <Link to="/app/patients"><Button variant="secondary">Back to patients</Button></Link>
            </div>
          </CardBody>
        </Card>
        <RequestConsentModal open={showRequest} onClose={() => setShowRequest(false)} patient={patient} />
      </div>
    );
  }

  /* --------------------------------------------------- AUTHORIZED VIEW ---- */
  const activeDx = bundle.diagnoses.filter((d) => d.status === "active");
  const latestLabs = bundle.labOrders.filter((l) => l.status === "resulted").slice(0, 5);
  const openTasks = bundle.careTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "timeline", label: "Timeline", count: patientTimeline(patient.id).length },
    { id: "encounters", label: "Encounters", count: bundle.encounters.length },
    { id: "labs", label: "Labs", count: bundle.labOrders.length },
    { id: "prescriptions", label: "Prescriptions", count: bundle.prescriptions.length },
    { id: "tasks", label: "Care tasks", count: bundle.careTasks.length },
  ];

  return (
    <div>
      <BackLink />

      {/* Identity header */}
      <div className="border border-line bg-surface">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3.5">
            <Avatar name={patient.name} className="h-12 w-12 rounded text-[15px]" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[18px] font-semibold tracking-tight text-zinc-100">{patient.name}</h1>
                <ConsentPill decision={access} />
                {crossTenant && <Badge tone="info">Cross-tenant</Badge>}
                <SampleTag />
              </div>
              <p className="mt-1 text-[13px] text-zinc-400">
                {patient.gender} · {ageFrom(patient.dob)} yrs · {patient.bloodGroup} · DOB {fmtDate(patient.dob)}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  ABHA {revealAbha ? patient.abha.number : maskAbha(patient.abha.number)}
                  <button onClick={() => setRevealAbha((v) => !v)} className="text-zinc-500 hover:text-zinc-200" aria-label="Toggle ABHA visibility">
                    {revealAbha ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  {patient.abhaVerified ? <Badge tone="positive">verified</Badge> : <Badge tone="muted">unverified</Badge>}
                </span>
                <span>{patient.contact.phone}</span>
                <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {orgById(patient.orgId)?.name}</span>
              </div>
            </div>
          </div>

          {isDoctor && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<Pill className="h-4 w-4" />} onClick={() => setShowRx(true)}>Prescribe</Button>
              <Button size="sm" variant="secondary" icon={<FlaskConical className="h-4 w-4" />} onClick={() => setShowLab(true)}>Order lab</Button>
              <Button size="sm" variant="secondary" icon={<ClipboardList className="h-4 w-4" />} onClick={() => setShowTask(true)}>Care task</Button>
              <Button size="sm" variant="ghost" icon={<StickyNote className="h-4 w-4" />} onClick={() => setShowNote(true)}>Note</Button>
            </div>
          )}
        </div>

        {/* Instrumentation strip */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line bg-canvas px-4 py-2.5 text-[11.5px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5 font-medium text-zinc-300"><Layers className="h-3.5 w-3.5 text-brand-500" /> Unified clinical context</span>
          <span>{totalRecords} records</span>
          <span>{sourceOrgs.length} organisation{sourceOrgs.length > 1 ? "s" : ""}</span>
          <span>assembled in one screen</span>
          {crossTenant && access.consent && <span className="font-mono text-zinc-400">consent {access.consent.id} · expires {access.consent.expiresOn ? fmtDate(access.consent.expiresOn) : "—"}</span>}
          <Link to="/app/audit" className="ml-auto font-medium text-brand-400 hover:text-brand-300">Logged →</Link>
        </div>
      </div>

      {/* Allergies */}
      {patient.allergies.length > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          <div>
            <p className="text-[13px] font-semibold text-rose-300">Allergies</p>
            <p className="text-[13px] text-rose-400">
              {patient.allergies.map((a) => `${a.substance} — ${a.reaction}${a.severity ? ` (${a.severity})` : ""}`).join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line scroll-slim">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors",
              tab === t.id ? "border-brand-600 text-brand-400" : "border-transparent text-zinc-400 hover:text-zinc-100",
            )}
          >
            {t.label}
            {typeof t.count === "number" && <span className="rounded-full bg-raised px-1.5 text-[11px] text-zinc-400">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {tab === "overview" && (
            <>
              <Card>
                <CardHeader title="Active problems" />
                <CardBody className="space-y-2.5">
                  {activeDx.length === 0 && <p className="text-[13px] text-zinc-400">No active diagnoses recorded.</p>}
                  {activeDx.map((d) => (
                    <div key={d.id} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13.5px] font-medium text-zinc-100">{d.label}</p>
                        <p className="text-[11px] text-zinc-500">{d.code ? `ICD-10 ${d.code} · ` : ""}since {fmtDate(d.date)} · {d.clinicianName}</p>
                      </div>
                      <Badge tone="warning">active</Badge>
                    </div>
                  ))}
                </CardBody>
              </Card>

              <div className="grid gap-6 sm:grid-cols-2">
                <Card>
                  <CardHeader title="Current medications" />
                  <CardBody className="space-y-2.5">
                    {patient.currentMedications.length === 0 && <p className="text-[13px] text-zinc-400">None.</p>}
                    {patient.currentMedications.map((m) => (
                      <div key={m.name} className="flex items-start gap-2.5">
                        <Pill className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                        <div>
                          <p className="text-[13px] font-medium text-zinc-100">{m.name}</p>
                          <p className="text-[11px] text-zinc-400">{m.dosage} · {m.frequency}</p>
                        </div>
                      </div>
                    ))}
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Latest results" />
                  <CardBody className="space-y-2.5">
                    {latestLabs.length === 0 && <p className="text-[13px] text-zinc-400">No resulted investigations.</p>}
                    {latestLabs.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-zinc-100">{l.test}</p>
                          <p className="text-[11px] text-zinc-500">{fmtDate(l.resultedOn || l.orderedOn)}</p>
                        </div>
                        <span className={cn("shrink-0 text-[13px] font-semibold tabular", l.abnormal ? "text-rose-400" : "text-emerald-400")}>
                          {l.resultValue} {l.unit}
                        </span>
                      </div>
                    ))}
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardHeader title="Recent encounters" action={<button onClick={() => setTab("encounters")} className="text-[13px] font-medium text-brand-400">All</button>} />
                <CardBody className="space-y-3">
                  {bundle.encounters.slice(0, 3).map((e) => (
                    <div key={e.id} className="rounded-lg border border-line p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={e.setting === "Emergency" ? "critical" : "neutral"}>{e.setting}</Badge>
                        <span className="text-[13px] font-medium text-zinc-100">{e.reason}</span>
                        <span className="ml-auto text-[11px] text-zinc-500">{fmtDate(e.date)}</span>
                      </div>
                      <p className="mt-1.5 text-[12.5px] text-zinc-400">{e.assessment}</p>
                      <p className="mt-1 text-[11px] text-zinc-500">{e.clinicianName} · {e.facilityName} · {e.disposition}</p>
                    </div>
                  ))}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Clinical notes" />
                <CardBody className="space-y-3">
                  {bundle.encounters.filter((e) => e.notes).map((e) => (
                    <NoteRow key={e.id} text={e.notes!} author={e.clinicianName} date={e.date} />
                  ))}
                  {notes.map((n) => <NoteRow key={n.id} text={n.detail || ""} author={n.actorName} date={n.ts} />)}
                  {notes.length === 0 && bundle.encounters.every((e) => !e.notes) && <p className="text-[13px] text-zinc-400">No notes on file.</p>}
                </CardBody>
              </Card>
            </>
          )}

          {tab === "timeline" && (
            <Card>
              <CardHeader title="Clinical timeline" description="Every recorded event, newest first, across all authorized sources." />
              <CardBody><Timeline events={patientTimeline(patient.id)} /></CardBody>
            </Card>
          )}

          {tab === "encounters" && (
            <Card>
              <CardHeader title="Encounters" />
              <CardBody className="space-y-3">
                {bundle.encounters.map((e) => (
                  <div key={e.id} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={e.setting === "Emergency" ? "critical" : "neutral"}>{e.setting}</Badge>
                      <span className="text-[14px] font-semibold text-zinc-100">{e.reason}</span>
                      <span className="ml-auto text-[12px] text-zinc-500">{fmtDate(e.date)} · {relative(e.date)}</span>
                    </div>
                    <p className="mt-2 text-[13px] text-zinc-200"><span className="font-medium text-zinc-400">Assessment. </span>{e.assessment}</p>
                    <p className="mt-1 text-[13px] text-zinc-200"><span className="font-medium text-zinc-400">Disposition. </span>{e.disposition}</p>
                    {e.notes && <p className="mt-2 rounded bg-canvas p-2 text-[12.5px] text-zinc-400">{e.notes}</p>}
                    <p className="mt-2 text-[11px] text-zinc-500">{e.clinicianName} · {e.facilityName}</p>
                  </div>
                ))}
                {bundle.encounters.length === 0 && <EmptyState icon={<Stethoscope className="h-5 w-5" />} title="No encounters recorded" />}
              </CardBody>
            </Card>
          )}

          {tab === "labs" && (
            <Card>
              <CardHeader title="Laboratory investigations" />
              <CardBody className="p-0">
                <DataTable
                  rows={bundle.labOrders}
                  rowKey={(l) => l.id}
                  empty={<EmptyState icon={<FlaskConical className="h-5 w-5" />} title="No investigations" />}
                  columns={[
                    { key: "test", header: "Test", render: (l) => <span className="font-medium text-zinc-100">{l.test}</span> },
                    { key: "result", header: "Result", render: (l) => l.status === "resulted"
                      ? <span className={cn("font-semibold tabular", l.abnormal ? "text-rose-400" : "text-emerald-400")}>{l.resultValue} {l.unit}</span>
                      : <span className="text-zinc-500">—</span> },
                    { key: "ref", header: "Reference", render: (l) => <span className="text-[12px] text-zinc-400">{l.referenceRange ?? "—"}</span> },
                    { key: "status", header: "Status", render: (l) => <Badge tone={LAB_STATUS_TONE[l.status]}>{l.status.replace(/_/g, " ")}</Badge> },
                    { key: "by", header: "Ordered by", render: (l) => <span className="text-[12px]">{l.orderedByName}</span> },
                    { key: "when", header: "Date", align: "right", render: (l) => fmtDate(l.resultedOn || l.orderedOn) },
                  ]}
                />
              </CardBody>
            </Card>
          )}

          {tab === "prescriptions" && (
            <Card>
              <CardHeader title="Prescriptions" />
              <CardBody className="space-y-3">
                {bundle.prescriptions.map((r) => (
                  <div key={r.id} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-zinc-100">{fmtDate(r.issuedOn)}</span>
                      <Badge tone={RX_STATUS_TONE[r.status]}>{r.status.replace(/_/g, " ")}</Badge>
                      <span className="ml-auto text-[11px] text-zinc-500">{r.prescriberName}</span>
                    </div>
                    <ul className="mt-2 divide-y divide-line">
                      {r.items.map((it, i) => (
                        <li key={i} className="py-1.5 text-[13px]">
                          <span className="font-medium text-zinc-100">{it.name}</span>
                          <span className="text-zinc-400"> — {it.dosage}, {it.frequency}{it.duration ? `, ${it.duration}` : ""}</span>
                          {it.instructions && <span className="block text-[11px] text-zinc-500">{it.instructions}</span>}
                        </li>
                      ))}
                    </ul>
                    {r.dispensedByName && <p className="mt-2 text-[11px] text-zinc-500">Dispensed by {r.dispensedByName} · {r.dispensedOn ? fmtDate(r.dispensedOn) : ""}</p>}
                  </div>
                ))}
                {bundle.prescriptions.length === 0 && <EmptyState icon={<Pill className="h-5 w-5" />} title="No prescriptions" />}
              </CardBody>
            </Card>
          )}

          {tab === "tasks" && (
            <Card>
              <CardHeader title="Care tasks" />
              <CardBody className="space-y-2.5">
                {bundle.careTasks.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 rounded-lg border border-line p-3">
                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", t.priority === "high" ? "bg-rose-500" : t.priority === "normal" ? "bg-amber-500" : "bg-zinc-600")} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-zinc-100">{t.title}</p>
                      <p className="text-[12px] text-zinc-400">{t.detail}</p>
                      <p className="mt-1 text-[11px] text-zinc-500">{t.createdByName} → {orgById(t.assigneeOrgId)?.name} · {t.dueOn ? `due ${fmtDate(t.dueOn)}` : "no due date"}</p>
                    </div>
                    <Badge tone={TASK_STATUS_TONE[t.status]}>{t.status.replace(/_/g, " ")}</Badge>
                  </div>
                ))}
                {bundle.careTasks.length === 0 && <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No care tasks" />}
              </CardBody>
            </Card>
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Consent status" description={crossTenant ? "Your organization's access to this record" : "Same-tenant care relationship"} />
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-zinc-400">Current</span>
                <ConsentPill decision={access} />
              </div>
              {bundle.consents.filter((c) => user.role === "SUPER_ADMIN" || c.requestingOrgId === user.orgId || !crossTenant).slice(0, 4).map((c) => (
                <div key={c.id} className="rounded-lg border border-line p-2.5 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-100">{orgById(c.requestingOrgId)?.name}</span>
                    <Badge tone={c.status === "approved" ? "positive" : c.status === "pending" ? "warning" : "critical"}>{c.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-zinc-400">{c.purpose}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{fmtDate(c.decidedOn || c.requestedOn)}{c.expiresOn ? ` · until ${fmtDate(c.expiresOn)}` : ""}</p>
                </div>
              ))}
              {crossTenant && (user.role === "DOCTOR" || user.role === "HOSPITAL_ADMIN") && (
                <Button size="sm" variant="secondary" className="w-full" onClick={() => setShowRequest(true)}>Request additional scope</Button>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Measurements" />
            <CardBody className="grid grid-cols-2 gap-3 text-[13px]">
              <Measure k="Height" v={patient.heightCm ? `${patient.heightCm} cm` : "—"} />
              <Measure k="Weight" v={patient.weightKg ? `${patient.weightKg} kg` : "—"} />
              <Measure k="BMI" v={patient.heightCm && patient.weightKg ? (patient.weightKg / (patient.heightCm / 100) ** 2).toFixed(1) : "—"} />
              <Measure k="Blood group" v={patient.bloodGroup} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Emergency contact" />
            <CardBody className="text-[13px]">
              <p className="font-medium text-zinc-100">{patient.emergencyContact.name}</p>
              <p className="text-zinc-400">{patient.emergencyContact.relation} · {patient.emergencyContact.phone}</p>
              <p className="mt-3 text-[12px] text-zinc-400">{patient.contact.address}</p>
            </CardBody>
          </Card>

          {openTasks.length > 0 && (
            <Card>
              <CardHeader title="Open care tasks" />
              <CardBody className="space-y-2">
                {openTasks.slice(0, 4).map((t) => (
                  <div key={t.id} className="text-[12.5px]">
                    <p className="font-medium text-zinc-100">{t.title}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Badge tone={TASK_STATUS_TONE[t.status]}>{t.status.replace(/_/g, " ")}</Badge>
                      {(user.orgId === t.assigneeOrgId || user.orgId === t.orgId) && t.status !== "completed" && (
                        <button
                          onClick={() => advanceTask(user, t.id, t.status === "pending" ? "in_progress" : "completed")}
                          className="text-[11px] font-medium text-brand-400 hover:text-brand-300"
                        >
                          {t.status === "pending" ? "Start" : "Complete"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <RequestConsentModal open={showRequest} onClose={() => setShowRequest(false)} patient={patient} />
      <NewPrescriptionModal open={showRx} onClose={() => setShowRx(false)} patient={patient} />
      <OrderLabModal open={showLab} onClose={() => setShowLab(false)} patient={patient} />
      <NewTaskModal open={showTask} onClose={() => setShowTask(false)} patient={patient} />
      <AddNoteModal open={showNote} onClose={() => setShowNote(false)} patient={patient} />
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/app/patients" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-400 hover:text-zinc-100">
      <ArrowLeft className="h-4 w-4" /> Patients
    </Link>
  );
}
function Measure({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-canvas p-2.5">
      <p className="text-[11px] text-zinc-500">{k}</p>
      <p className="mt-0.5 font-semibold text-zinc-100 tabular">{v}</p>
    </div>
  );
}
function NoteRow({ text, author, date }: { text: string; author: string; date: string }) {
  return (
    <div className="rounded-lg border border-line bg-white/[0.03] p-3">
      <p className="text-[13px] text-zinc-200">{text}</p>
      <p className="mt-1 text-[11px] text-zinc-500">{author} · {fmtDate(date)}</p>
    </div>
  );
}
