import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { patientBundle, orgById } from "@/data/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody, Badge, EmptyState } from "@/components/ui/primitives";
import { TASK_STATUS_TONE, PRIORITY_TONE } from "@/lib/status";
import { fmtDate } from "@/lib/format";
import { ClipboardList } from "lucide-react";

export default function MyCare() {
  useStore();
  const { user } = useAuth();
  if (!user?.patientId) return null;
  const { careTasks } = patientBundle(user.patientId);
  const open = careTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const done = careTasks.filter((t) => t.status === "completed");

  return (
    <div>
      <PageHeader title="Care tasks" description="Follow-ups, tests and referrals your care team is coordinating for you." />
      <Card>
        <CardBody className="space-y-3">
          {open.length === 0 && <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="Nothing outstanding" description="Your care team has no open tasks for you right now." />}
          {open.map((t) => (
            <div key={t.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-zinc-100">{t.title}</span>
                <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                <Badge tone={TASK_STATUS_TONE[t.status]}>{t.status.replace(/_/g, " ")}</Badge>
              </div>
              <p className="mt-1 text-[13px] text-zinc-400">{t.detail}</p>
              <p className="mt-1.5 text-[11px] text-zinc-500">
                Coordinated by {orgById(t.orgId)?.name} · handled at {orgById(t.assigneeOrgId)?.name}
                {t.dueOn ? ` · due ${fmtDate(t.dueOn)}` : ""}
              </p>
            </div>
          ))}
        </CardBody>
      </Card>

      {done.length > 0 && (
        <Card className="mt-6">
          <CardBody className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Completed</p>
            {done.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-[13px]">
                <span className="text-zinc-200">{t.title}</span>
                <span className="text-[11px] text-zinc-500">{t.completedOn ? fmtDate(t.completedOn) : ""}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
