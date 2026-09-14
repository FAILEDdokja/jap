import { useAuth } from "@/auth/AuthContext";
import { PageLoader } from "@/components/ui/primitives";
import DoctorDashboard from "./DoctorDashboard";
import AdminDashboard from "./AdminDashboard";
import PatientDashboard from "./PatientDashboard";
import LabDashboard from "./LabDashboard";
import PharmacyDashboard from "./PharmacyDashboard";
import PlatformDashboard from "./PlatformDashboard";

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return <PageLoader />;
  switch (user.role) {
    case "DOCTOR": return <DoctorDashboard />;
    case "HOSPITAL_ADMIN": return <AdminDashboard />;
    case "PATIENT": return <PatientDashboard />;
    case "LAB": return <LabDashboard />;
    case "PHARMACY": return <PharmacyDashboard />;
    case "SUPER_ADMIN": return <PlatformDashboard />;
    default: return null;
  }
}
