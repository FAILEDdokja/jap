import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

import Dashboard from "@/pages/dashboards/Dashboard";
import PatientList from "@/pages/patients/PatientList";
import PatientProfile from "@/pages/patients/PatientProfile";
import ConsentCenter from "@/pages/ConsentCenter";
import Coordination from "@/pages/Coordination";
import LabOrders from "@/pages/LabOrders";
import Prescriptions from "@/pages/Prescriptions";
import Audit from "@/pages/Audit";
import Staff from "@/pages/Staff";
import Organizations from "@/pages/Organizations";
import Analytics from "@/pages/Analytics";
import MyTimeline from "@/pages/patient/MyTimeline";
import MyRecords from "@/pages/patient/MyRecords";
import MyConsents from "@/pages/patient/MyConsents";
import MyCare from "@/pages/patient/MyCare";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="patients" element={<PatientList />} />
        <Route path="patients/:patientId" element={<PatientProfile />} />
        <Route path="consent" element={<ConsentCenter />} />
        <Route path="coordination" element={<Coordination />} />
        <Route path="lab-orders" element={<LabOrders />} />
        <Route path="prescriptions" element={<Prescriptions />} />
        <Route path="audit" element={<Audit />} />
        <Route path="staff" element={<Staff />} />
        <Route path="organizations" element={<Organizations />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="my-timeline" element={<MyTimeline />} />
        <Route path="my-records" element={<MyRecords />} />
        <Route path="my-consents" element={<MyConsents />} />
        <Route path="my-care" element={<MyCare />} />
      </Route>

      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
