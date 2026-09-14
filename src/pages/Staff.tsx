import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { getDb, orgById, inviteUser } from "@/data/store";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody, Badge, Button, Avatar, EmptyState, Field, Input, Select } from "@/components/ui/primitives";
import { DataTable } from "@/components/DataTable";
import { Modal } from "@/components/ui/Modal";
import { ROLE_LABEL } from "@/auth/roles";
import type { Role } from "@/data/types";

export default function Staff() {
  useStore();
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<Role>("DOCTOR");
  const [orgId, setOrgId] = useState(user?.orgId ?? "");
  if (!user) return null;
  const db = getDb();
  const isPlatform = user.role === "SUPER_ADMIN";
  const rows = isPlatform ? db.users : db.users.filter((u) => u.orgId === user.orgId);

  const roleOptions: Role[] = isPlatform
    ? ["DOCTOR", "HOSPITAL_ADMIN", "LAB", "PHARMACY", "SUPER_ADMIN"]
    : ["DOCTOR", "HOSPITAL_ADMIN"];

  function submit() {
    if (!user) return;
    inviteUser(user, { name, email, role, title, orgId: isPlatform ? orgId : user.orgId });
    toast.push({ tone: "success", title: "Invitation created", body: `${name} added to ${orgById(isPlatform ? orgId : user.orgId)?.name}.` });
    setName(""); setEmail(""); setTitle("");
    setOpen(false);
  }

  return (
    <div>
      <PageHeader
        title={isPlatform ? "Users" : "Staff"}
        description={isPlatform ? "Every account across every tenant." : "People in your organization and what they can do."}
        actions={<Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setOpen(true)}>Invite</Button>}
      />
      <Card>
        <CardBody className="p-0">
          <DataTable
            rows={rows}
            rowKey={(u) => u.id}
            empty={<EmptyState icon={<Users className="h-5 w-5" />} title="No staff accounts" />}
            columns={[
              { key: "name", header: "Name", render: (u) => <div className="flex items-center gap-3"><Avatar name={u.name} /><div><p className="font-medium text-zinc-100">{u.name}</p><p className="text-[12px] text-zinc-400">{u.email}</p></div></div> },
              { key: "title", header: "Title", render: (u) => u.title ?? "—" },
              { key: "role", header: "Role", render: (u) => <Badge tone="neutral">{ROLE_LABEL[u.role]}</Badge> },
              ...(isPlatform ? [{ key: "org", header: "Organization", render: (u: any) => orgById(u.orgId)?.name ?? "—" }] : []),
              { key: "status", header: "Status", align: "right" as const, render: () => <Badge tone="positive">active</Badge> },
            ]}
          />
        </CardBody>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Invite a team member"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit} disabled={!name.trim() || !email.trim()}>Send invite</Button></>}>
        <div className="space-y-3">
          <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Work email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Cardiology" /></Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            </Field>
          </div>
          {isPlatform && (
            <Field label="Organization">
              <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                {getDb().organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
      </Modal>
    </div>
  );
}
