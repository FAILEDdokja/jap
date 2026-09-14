import { useAuth } from "@/auth/AuthContext";
import { useStore } from "@/data/useStore";
import { patientTimeline } from "@/data/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody, SampleTag } from "@/components/ui/primitives";
import { Timeline } from "@/components/Timeline";

export default function MyTimeline() {
  useStore();
  const { user } = useAuth();
  if (!user?.patientId) return null;
  const events = patientTimeline(user.patientId);
  return (
    <div>
      <PageHeader title="My timeline" description={<>Your complete health history across every hospital, lab and pharmacy on the network. <SampleTag /></>} />
      <Card>
        <CardBody><Timeline events={events} /></CardBody>
      </Card>
    </div>
  );
}
