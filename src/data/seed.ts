/**
 * Deterministic demo seed for Jan Arogya Nexus.
 *
 * All records here are SYNTHETIC. Names, ABHA numbers, contact details and
 * clinical facts are fabricated for demonstration and carry a visible "Sample
 * data" treatment throughout the UI. Nothing in this file represents a real
 * person or a real health record.
 */
import type {
  Database, Organization, User, Patient, Diagnosis, Encounter,
  Prescription, LabOrder, Consent, CareTask, Notification, AuditEvent,
} from "./types";

const iso = (d: string) => new Date(d).toISOString();
const daysAgo = (n: number) => {
  const d = new Date("2026-09-10T09:30:00");
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

/* ------------------------------------------------------------------ orgs --- */
const organizations: Organization[] = [
  { id: "org-platform", name: "Jan Arogya Nexus", type: "platform", code: "NEXUS", city: "Bengaluru", state: "Karnataka", createdOn: iso("2025-11-01") },
  { id: "org-nmc", name: "Nashik City Medical College & Hospital", type: "hospital", code: "NMC-NAS", city: "Nashik", state: "Maharashtra", createdOn: iso("2025-12-04") },
  { id: "org-sanjivani", name: "Sanjivani Multispecialty Hospital", type: "hospital", code: "SANJ-PUN", city: "Pune", state: "Maharashtra", createdOn: iso("2026-01-18") },
  { id: "org-pathcare", name: "PathCare Diagnostics", type: "lab", code: "PATH-NAS", city: "Nashik", state: "Maharashtra", createdOn: iso("2026-01-22") },
  { id: "org-medplus", name: "MedPlus Community Pharmacy", type: "pharmacy", code: "MEDP-NAS", city: "Nashik", state: "Maharashtra", createdOn: iso("2026-02-10") },
];

/* ----------------------------------------------------------------- users --- */
const users: User[] = [
  { id: "u-super", name: "Kavita Rao", email: "kavita.rao@janarogyanexus.in", role: "SUPER_ADMIN", orgId: "org-platform", title: "Platform Operations" },

  { id: "u-nmc-admin", name: "Sanjay Gupta", email: "sanjay.gupta@nmc.example.in", role: "HOSPITAL_ADMIN", orgId: "org-nmc", title: "Medical Superintendent" },
  { id: "u-aroha", name: "Dr. Aroha Deshpande", email: "aroha.deshpande@nmc.example.in", role: "DOCTOR", orgId: "org-nmc", title: "Internal Medicine", phone: "98230 11002" },
  { id: "u-vikram", name: "Dr. Vikram Nair", email: "vikram.nair@nmc.example.in", role: "DOCTOR", orgId: "org-nmc", title: "Pulmonology", phone: "98230 11044" },

  { id: "u-sanj-admin", name: "Neha Kulkarni", email: "neha.kulkarni@sanjivani.example.in", role: "HOSPITAL_ADMIN", orgId: "org-sanjivani", title: "Hospital Administrator" },
  { id: "u-farah", name: "Dr. Farah Sheikh", email: "farah.sheikh@sanjivani.example.in", role: "DOCTOR", orgId: "org-sanjivani", title: "Cardiology", phone: "99000 22071" },

  { id: "u-lab", name: "Anil Menon", email: "anil.menon@pathcare.example.in", role: "LAB", orgId: "org-pathcare", title: "Lab Manager" },
  { id: "u-pharm", name: "Deepa Iyer", email: "deepa.iyer@medplus.example.in", role: "PHARMACY", orgId: "org-medplus", title: "Chief Pharmacist" },

  { id: "u-amit", name: "Amit Kumar", email: "amit.kumar@abdm.example.in", role: "PATIENT", orgId: "org-nmc", patientId: "p-01" },
  { id: "u-priya", name: "Priya Patel", email: "priya.patel@abdm.example.in", role: "PATIENT", orgId: "org-nmc", patientId: "p-02" },
];

/* -------------------------------------------------------------- patients --- */
const patients: Patient[] = [
  {
    id: "p-01", orgId: "org-nmc", name: "Amit Kumar", gender: "Male", dob: "1991-03-14",
    abha: { number: "23-4567-8912-3401", address: "amit.kumar@abdm" }, abhaVerified: true,
    contact: { phone: "98230 45671", address: "House 22, Panchavati, Nashik, Maharashtra 422003", email: "amit.kumar@abdm.example.in" },
    emergencyContact: { name: "Sunita Kumar", relation: "Spouse", phone: "98230 45672" },
    bloodGroup: "B+", heightCm: 172, weightKg: 81,
    chronicConditions: ["Type 2 diabetes mellitus", "Essential hypertension"],
    allergies: [{ substance: "Penicillin", reaction: "Urticarial rash", severity: "moderate" }],
    currentMedications: [
      { name: "Metformin", dosage: "500 mg", frequency: "Twice daily", since: "2023-05-01" },
      { name: "Telmisartan", dosage: "40 mg", frequency: "Once daily", since: "2024-02-01" },
    ],
    registeredOn: iso("2023-05-01"),
  },
  {
    id: "p-02", orgId: "org-nmc", name: "Priya Patel", gender: "Female", dob: "1985-11-02",
    abha: { number: "34-5678-9123-4502", address: "priya.patel@abdm" }, abhaVerified: true,
    contact: { phone: "98500 21436", address: "Flat 4B, Adgaon Road, Nashik, Maharashtra 422009" },
    emergencyContact: { name: "Nikhil Patel", relation: "Brother", phone: "98500 21437" },
    bloodGroup: "O+", heightCm: 160, weightKg: 58,
    chronicConditions: ["Bronchial asthma"],
    allergies: [],
    currentMedications: [{ name: "Budesonide/Formoterol inhaler", dosage: "1 puff", frequency: "Twice daily", since: "2022-08-01" }],
    registeredOn: iso("2022-08-01"),
  },
  {
    id: "p-03", orgId: "org-nmc", name: "Rahul Sharma", gender: "Male", dob: "1978-07-21",
    abha: { number: "45-6789-1234-5603", address: "rahul.sharma@abdm" }, abhaVerified: true,
    contact: { phone: "98909 76512", address: "Shop 3, College Road, Nashik, Maharashtra 422005" },
    emergencyContact: { name: "Meena Sharma", relation: "Spouse", phone: "98909 76513" },
    bloodGroup: "A-", heightCm: 175, weightKg: 70,
    chronicConditions: [],
    allergies: [{ substance: "Sulfonamides", reaction: "Hives", severity: "mild" }],
    currentMedications: [],
    registeredOn: iso("2021-02-11"),
  },
  {
    id: "p-04", orgId: "org-sanjivani", name: "Sunita Deshmukh", gender: "Female", dob: "1963-01-09",
    abha: { number: "56-7890-1234-5604", address: "sunita.deshmukh@abdm" }, abhaVerified: true,
    contact: { phone: "97640 33218", address: "Lane 5, Kothrud, Pune, Maharashtra 411038" },
    emergencyContact: { name: "Arjun Deshmukh", relation: "Son", phone: "97640 33219" },
    bloodGroup: "AB+", heightCm: 156, weightKg: 61,
    chronicConditions: ["Chronic kidney disease, stage 3b", "Anaemia of chronic disease", "Type 2 diabetes mellitus"],
    allergies: [],
    currentMedications: [
      { name: "Erythropoietin", dosage: "4000 IU", frequency: "Weekly", since: "2025-10-01" },
      { name: "Insulin glargine", dosage: "18 units", frequency: "At night", since: "2024-06-01" },
    ],
    registeredOn: iso("2024-06-02"),
  },
  {
    id: "p-05", orgId: "org-sanjivani", name: "Iqbal Ansari", gender: "Male", dob: "1968-05-30",
    abha: { number: "67-8901-2345-6705", address: "iqbal.ansari@abdm" }, abhaVerified: true,
    contact: { phone: "96070 55412", address: "24 Camp Road, Pune, Maharashtra 411001" },
    emergencyContact: { name: "Rukhsana Ansari", relation: "Spouse", phone: "96070 55413" },
    bloodGroup: "B-", heightCm: 170, weightKg: 74,
    chronicConditions: ["Coronary artery disease", "Post anterior wall STEMI (Mar 2026)"],
    allergies: [],
    currentMedications: [
      { name: "Aspirin", dosage: "75 mg", frequency: "Once daily", since: "2026-03-14" },
      { name: "Ticagrelor", dosage: "90 mg", frequency: "Twice daily", since: "2026-03-14" },
      { name: "Atorvastatin", dosage: "80 mg", frequency: "At night", since: "2026-03-14" },
    ],
    registeredOn: iso("2026-03-14"),
  },
  {
    id: "p-06", orgId: "org-nmc", name: "Meera Joshi", gender: "Female", dob: "1997-09-19",
    abha: { number: "78-9012-3456-7806", address: "meera.joshi@abdm" }, abhaVerified: false,
    contact: { phone: "95030 71190", address: "Plot 9, Indira Nagar, Nashik, Maharashtra 422009" },
    emergencyContact: { name: "Rohit Joshi", relation: "Spouse", phone: "95030 71191" },
    bloodGroup: "O-", heightCm: 163, weightKg: 64,
    chronicConditions: ["Intrauterine pregnancy, 28 weeks"],
    allergies: [],
    currentMedications: [
      { name: "Ferrous ascorbate + folic acid", dosage: "1 tablet", frequency: "Once daily", since: "2026-04-01" },
      { name: "Calcium carbonate", dosage: "500 mg", frequency: "Twice daily", since: "2026-04-01" },
    ],
    registeredOn: iso("2026-03-20"),
  },
];

/* ------------------------------------------------------------- diagnoses --- */
const diagnoses: Diagnosis[] = [
  { id: "dx-01", patientId: "p-01", orgId: "org-nmc", label: "Type 2 diabetes mellitus without complications", code: "E11.9", date: "2023-05-01", status: "active", clinicianName: "Dr. Aroha Deshpande" },
  { id: "dx-02", patientId: "p-01", orgId: "org-nmc", label: "Essential (primary) hypertension", code: "I10", date: "2024-02-01", status: "active", clinicianName: "Dr. Aroha Deshpande" },
  { id: "dx-03", patientId: "p-01", orgId: "org-nmc", label: "Community-acquired pneumonia, right lower lobe", code: "J18.1", date: daysAgo(3), status: "active", encounterId: "enc-1041", clinicianName: "Dr. Vikram Nair" },
  { id: "dx-04", patientId: "p-02", orgId: "org-nmc", label: "Moderate persistent asthma with acute exacerbation", code: "J45.41", date: daysAgo(7), status: "resolved", encounterId: "enc-1033", clinicianName: "Dr. Vikram Nair" },
  { id: "dx-05", patientId: "p-04", orgId: "org-sanjivani", label: "Chronic kidney disease, stage 3b", code: "N18.32", date: "2025-09-20", status: "active", clinicianName: "Dr. Farah Sheikh" },
  { id: "dx-06", patientId: "p-05", orgId: "org-sanjivani", label: "ST elevation myocardial infarction of anterior wall", code: "I21.0", date: "2026-03-14", status: "resolved", clinicianName: "Dr. Farah Sheikh" },
  { id: "dx-07", patientId: "p-05", orgId: "org-sanjivani", label: "Atherosclerotic heart disease of native coronary artery", code: "I25.10", date: "2026-03-20", status: "active", clinicianName: "Dr. Farah Sheikh" },
  { id: "dx-08", patientId: "p-03", orgId: "org-nmc", label: "Low back pain, mechanical", code: "M54.5", date: "2026-02-11", status: "resolved", clinicianName: "Dr. Aroha Deshpande" },
];

/* ------------------------------------------------------------ encounters --- */
const encounters: Encounter[] = [
  { id: "enc-1041", patientId: "p-01", orgId: "org-nmc", facilityName: "Nashik City Medical College & Hospital", date: daysAgo(3), setting: "IPD", clinicianId: "u-vikram", clinicianName: "Dr. Vikram Nair", reason: "Fever and productive cough for 4 days", assessment: "Community-acquired pneumonia, right lower lobe, moderate severity. Glycaemic control suboptimal (HbA1c 8.4%).", disposition: "Admitted to Ward B, Bed 3", notes: "IV antibiotics started. Diabetes team review requested. Prefers Marathi for medication counselling." },
  { id: "enc-0916", patientId: "p-01", orgId: "org-nmc", facilityName: "Nashik City Medical College & Hospital", date: "2026-06-02", setting: "OPD", clinicianId: "u-aroha", clinicianName: "Dr. Aroha Deshpande", reason: "Diabetes review", assessment: "HbA1c 7.6%. Metformin dose unchanged. BP 132/84.", disposition: "Continue OPD follow-up in 3 months" },
  { id: "enc-1033", patientId: "p-02", orgId: "org-nmc", facilityName: "Nashik City Medical College & Hospital", date: daysAgo(7), setting: "IPD", clinicianId: "u-vikram", clinicianName: "Dr. Vikram Nair", reason: "Acute breathlessness", assessment: "Moderate asthma exacerbation, responded to nebulisation and steroids.", disposition: "Discharged after 5 days, step-up inhaler advised" },
  { id: "enc-0820", patientId: "p-03", orgId: "org-nmc", facilityName: "Nashik City Medical College & Hospital", date: "2026-02-11", setting: "OPD", clinicianId: "u-aroha", clinicianName: "Dr. Aroha Deshpande", reason: "Lower back pain for 2 weeks", assessment: "Mechanical lumbar pain, no red flags, no radiculopathy.", disposition: "Analgesia and physiotherapy referral" },
  { id: "enc-2201", patientId: "p-04", orgId: "org-sanjivani", facilityName: "Sanjivani Multispecialty Hospital", date: daysAgo(12), setting: "OPD", clinicianId: "u-farah", clinicianName: "Dr. Farah Sheikh", reason: "CKD and anaemia review", assessment: "eGFR 34. Hb 9.2 g/dL. Continue erythropoietin, add oral iron.", disposition: "Nephrology follow-up in 4 weeks" },
  { id: "enc-2114", patientId: "p-05", orgId: "org-sanjivani", facilityName: "Sanjivani Multispecialty Hospital", date: "2026-03-14", setting: "Emergency", clinicianId: "u-farah", clinicianName: "Dr. Farah Sheikh", reason: "Central chest pain, 2 hours", assessment: "Anterior wall STEMI. Primary PCI to LAD with drug-eluting stent.", disposition: "Admitted to CCU, dual antiplatelet therapy started" },
  { id: "enc-2130", patientId: "p-05", orgId: "org-sanjivani", facilityName: "Sanjivani Multispecialty Hospital", date: daysAgo(21), setting: "OPD", clinicianId: "u-farah", clinicianName: "Dr. Farah Sheikh", reason: "Post-MI review, week 24", assessment: "Asymptomatic. LVEF improved to 46%. Continue secondary prevention.", disposition: "Cardiac rehab ongoing, review in 3 months" },
  { id: "enc-2405", patientId: "p-06", orgId: "org-nmc", facilityName: "Nashik City Medical College & Hospital", date: daysAgo(5), setting: "OPD", clinicianId: "u-aroha", clinicianName: "Dr. Aroha Deshpande", reason: "Antenatal visit, 28 weeks", assessment: "Fundal height appropriate. BP 118/76. Hb 10.4 g/dL. GCT within range.", disposition: "Routine antenatal follow-up in 3 weeks" },
];

/* ---------------------------------------------------------- prescriptions --- */
const prescriptions: Prescription[] = [
  { id: "rx-5001", patientId: "p-01", encounterId: "enc-1041", orgId: "org-nmc", issuedOn: daysAgo(3), prescriberId: "u-vikram", prescriberName: "Dr. Vikram Nair", status: "partially_dispensed", dispensedByOrgId: "org-medplus", dispensedByName: "MedPlus Community Pharmacy", dispensedOn: daysAgo(2),
    items: [
      { name: "Cefpodoxime", dosage: "200 mg", frequency: "Twice daily", duration: "7 days", instructions: "After food. Cephalosporin — chosen because of penicillin allergy." },
      { name: "Paracetamol", dosage: "650 mg", frequency: "Up to three times daily", duration: "3 days", instructions: "When temperature above 38 C" },
      { name: "Metformin", dosage: "500 mg", frequency: "Twice daily", duration: "Continue", instructions: "Existing medicine, continue" },
    ] },
  { id: "rx-4200", patientId: "p-01", encounterId: "enc-0916", orgId: "org-nmc", issuedOn: "2026-06-02", prescriberId: "u-aroha", prescriberName: "Dr. Aroha Deshpande", status: "dispensed", dispensedByOrgId: "org-medplus", dispensedByName: "MedPlus Community Pharmacy", dispensedOn: "2026-06-02",
    items: [{ name: "Metformin", dosage: "500 mg", frequency: "Twice daily", duration: "60 days", instructions: "After meals" }, { name: "Telmisartan", dosage: "40 mg", frequency: "Once daily", duration: "60 days", instructions: "Morning" }] },
  { id: "rx-5010", patientId: "p-02", encounterId: "enc-1033", orgId: "org-nmc", issuedOn: daysAgo(7), prescriberId: "u-vikram", prescriberName: "Dr. Vikram Nair", status: "dispensed", dispensedByOrgId: "org-medplus", dispensedByName: "MedPlus Community Pharmacy", dispensedOn: daysAgo(6),
    items: [{ name: "Prednisolone", dosage: "40 mg", frequency: "Once daily", duration: "5 days", instructions: "After breakfast" }, { name: "Budesonide/Formoterol", dosage: "1 puff", frequency: "Twice daily", duration: "Continue", instructions: "Step-up dose" }] },
  { id: "rx-6001", patientId: "p-05", encounterId: "enc-2130", orgId: "org-sanjivani", issuedOn: daysAgo(21), prescriberId: "u-farah", prescriberName: "Dr. Farah Sheikh", status: "issued",
    items: [{ name: "Aspirin", dosage: "75 mg", frequency: "Once daily", duration: "Continue", instructions: "Lifelong" }, { name: "Ticagrelor", dosage: "90 mg", frequency: "Twice daily", duration: "Until Mar 2027", instructions: "Do not stop without cardiology advice" }, { name: "Atorvastatin", dosage: "80 mg", frequency: "At night", duration: "Continue" }] },
  { id: "rx-6100", patientId: "p-04", encounterId: "enc-2201", orgId: "org-sanjivani", issuedOn: daysAgo(12), prescriberId: "u-farah", prescriberName: "Dr. Farah Sheikh", status: "issued",
    items: [{ name: "Ferrous ascorbate", dosage: "100 mg", frequency: "Once daily", duration: "90 days", instructions: "Empty stomach if tolerated" }, { name: "Erythropoietin", dosage: "4000 IU", frequency: "Weekly, subcutaneous", duration: "Continue" }] },
];

/* ------------------------------------------------------------- lab orders --- */
const labOrders: LabOrder[] = [
  { id: "lab-9001", patientId: "p-01", orderedByOrgId: "org-nmc", orderedByName: "Dr. Vikram Nair", performingOrgId: "org-pathcare", test: "HbA1c", panel: "Diabetes", priority: "routine", orderedOn: daysAgo(3), status: "resulted", collectedOn: daysAgo(3), resultedOn: daysAgo(2), resultSummary: "Above target", resultValue: "8.4", unit: "%", referenceRange: "< 7.0", abnormal: true },
  { id: "lab-9002", patientId: "p-01", orderedByOrgId: "org-nmc", orderedByName: "Dr. Vikram Nair", performingOrgId: "org-pathcare", test: "Complete blood count", panel: "Haematology", priority: "urgent", orderedOn: daysAgo(3), status: "resulted", collectedOn: daysAgo(3), resultedOn: daysAgo(3), resultSummary: "Neutrophilic leukocytosis", resultValue: "14.2", unit: "x10^9/L", referenceRange: "4.0 - 11.0", abnormal: true },
  { id: "lab-9003", patientId: "p-01", orderedByOrgId: "org-nmc", orderedByName: "Dr. Vikram Nair", performingOrgId: "org-pathcare", test: "C-reactive protein", panel: "Inflammation", priority: "urgent", orderedOn: daysAgo(3), status: "resulted", collectedOn: daysAgo(3), resultedOn: daysAgo(3), resultSummary: "Elevated", resultValue: "96", unit: "mg/L", referenceRange: "< 5", abnormal: true },
  { id: "lab-9010", patientId: "p-01", orderedByOrgId: "org-nmc", orderedByName: "Dr. Vikram Nair", performingOrgId: "org-pathcare", test: "Blood culture", panel: "Microbiology", priority: "urgent", orderedOn: daysAgo(3), status: "in_progress", collectedOn: daysAgo(3) },
  { id: "lab-9011", patientId: "p-01", orderedByOrgId: "org-nmc", orderedByName: "Dr. Aroha Deshpande", performingOrgId: "org-pathcare", test: "Serum creatinine", panel: "Renal", priority: "routine", orderedOn: daysAgo(1), status: "ordered" },
  { id: "lab-9101", patientId: "p-04", orderedByOrgId: "org-sanjivani", orderedByName: "Dr. Farah Sheikh", performingOrgId: "org-pathcare", test: "eGFR (CKD-EPI)", panel: "Renal", priority: "routine", orderedOn: daysAgo(12), status: "resulted", collectedOn: daysAgo(12), resultedOn: daysAgo(11), resultSummary: "Stage 3b", resultValue: "34", unit: "mL/min/1.73m2", referenceRange: "> 60", abnormal: true },
  { id: "lab-9102", patientId: "p-04", orderedByOrgId: "org-sanjivani", orderedByName: "Dr. Farah Sheikh", performingOrgId: "org-pathcare", test: "Haemoglobin", panel: "Haematology", priority: "routine", orderedOn: daysAgo(12), status: "resulted", collectedOn: daysAgo(12), resultedOn: daysAgo(11), resultSummary: "Low", resultValue: "9.2", unit: "g/dL", referenceRange: "12.0 - 15.0", abnormal: true },
  { id: "lab-9201", patientId: "p-05", orderedByOrgId: "org-sanjivani", orderedByName: "Dr. Farah Sheikh", performingOrgId: "org-pathcare", test: "Lipid profile", panel: "Cardiac risk", priority: "routine", orderedOn: daysAgo(21), status: "resulted", collectedOn: daysAgo(21), resultedOn: daysAgo(20), resultSummary: "LDL at target", resultValue: "68", unit: "mg/dL", referenceRange: "< 70 (secondary prevention)", abnormal: false },
  { id: "lab-9301", patientId: "p-06", orderedByOrgId: "org-nmc", orderedByName: "Dr. Aroha Deshpande", performingOrgId: "org-pathcare", test: "Glucose challenge test", panel: "Antenatal", priority: "routine", orderedOn: daysAgo(5), status: "resulted", collectedOn: daysAgo(5), resultedOn: daysAgo(4), resultSummary: "Within range", resultValue: "128", unit: "mg/dL", referenceRange: "< 140", abnormal: false },
  { id: "lab-9302", patientId: "p-02", orderedByOrgId: "org-nmc", orderedByName: "Dr. Vikram Nair", performingOrgId: "org-pathcare", test: "Peak expiratory flow", panel: "Respiratory", priority: "routine", orderedOn: daysAgo(7), status: "collected", collectedOn: daysAgo(6) },
];

/* --------------------------------------------------------------- consents --- */
const consents: Consent[] = [
  { id: "con-01", patientId: "p-04", requestingOrgId: "org-nmc", requestingUserId: "u-aroha", requestingUserName: "Dr. Aroha Deshpande", purpose: "Co-management of diabetes during Nashik visit", scope: ["Diagnoses", "Medications", "Lab results", "Encounters"], hiTypes: ["Prescription", "DiagnosticReport", "OPConsultation"], requestedOn: daysAgo(9), status: "approved", decidedOn: daysAgo(9), expiresOn: daysAgo(-81), note: "Granted for 90 days by patient." },
  { id: "con-02", patientId: "p-05", requestingOrgId: "org-nmc", requestingUserId: "u-vikram", requestingUserName: "Dr. Vikram Nair", purpose: "Pre-operative pulmonary assessment referral", scope: ["Diagnoses", "Medications", "Encounters"], hiTypes: ["OPConsultation", "Prescription"], requestedOn: daysAgo(2), status: "pending" },
  { id: "con-03", patientId: "p-01", requestingOrgId: "org-sanjivani", requestingUserId: "u-farah", requestingUserName: "Dr. Farah Sheikh", purpose: "Cardiology opinion on exertional breathlessness", scope: ["Diagnoses", "Medications", "Lab results", "Encounters", "Prescriptions"], hiTypes: ["DiagnosticReport", "Prescription", "OPConsultation"], requestedOn: daysAgo(1), status: "pending" },
  { id: "con-04", patientId: "p-02", requestingOrgId: "org-sanjivani", requestingUserId: "u-farah", requestingUserName: "Dr. Farah Sheikh", purpose: "Second opinion, chronic cough", scope: ["Diagnoses", "Encounters"], hiTypes: ["OPConsultation"], requestedOn: "2026-05-02", status: "expired", decidedOn: "2026-05-02", expiresOn: "2026-08-02" },
  { id: "con-05", patientId: "p-03", requestingOrgId: "org-sanjivani", requestingUserId: "u-farah", requestingUserName: "Dr. Farah Sheikh", purpose: "Orthopaedic records request", scope: ["Encounters", "Lab results"], hiTypes: ["DiagnosticReport"], requestedOn: "2026-06-14", status: "denied", decidedOn: "2026-06-15", note: "Patient declined - unrelated specialty." },
];

/* ------------------------------------------------------------- care tasks --- */
const careTasks: CareTask[] = [
  { id: "task-01", patientId: "p-01", orgId: "org-nmc", title: "Repeat serum creatinine before contrast CT", detail: "Baseline renal function needed prior to imaging. Sample to PathCare.", type: "lab_order", priority: "high", assigneeOrgId: "org-pathcare", assigneeRole: "LAB", createdById: "u-vikram", createdByName: "Dr. Vikram Nair", status: "pending", createdOn: daysAgo(1), dueOn: daysAgo(-1), linkedOrderId: "lab-9011" },
  { id: "task-02", patientId: "p-01", orgId: "org-nmc", title: "Diabetes education in Marathi", detail: "Counsel on insulin sliding scale and hypoglycaemia recognition. Family to be present.", type: "follow_up", priority: "normal", assigneeOrgId: "org-nmc", assigneeRole: "DOCTOR", createdById: "u-vikram", createdByName: "Dr. Vikram Nair", status: "in_progress", createdOn: daysAgo(2), dueOn: daysAgo(-1) },
  { id: "task-03", patientId: "p-01", orgId: "org-nmc", title: "Blood culture result review", detail: "Follow up microbiology at 48 hours and de-escalate antibiotics if negative.", type: "follow_up", priority: "high", assigneeOrgId: "org-nmc", assigneeRole: "DOCTOR", createdById: "u-vikram", createdByName: "Dr. Vikram Nair", status: "pending", createdOn: daysAgo(3), dueOn: "2026-09-10", linkedOrderId: "lab-9010" },
  { id: "task-04", patientId: "p-04", orgId: "org-nmc", title: "Share nephrology summary with Sanjivani", detail: "Consent approved. Send consolidated CKD summary to referring cardiologist.", type: "referral", priority: "normal", assigneeOrgId: "org-nmc", assigneeRole: "DOCTOR", createdById: "u-aroha", createdByName: "Dr. Aroha Deshpande", status: "completed", createdOn: daysAgo(8), completedOn: daysAgo(7) },
  { id: "task-05", patientId: "p-05", orgId: "org-sanjivani", title: "Cardiac rehab session 9", detail: "Supervised exercise session. Record Borg score and any symptoms.", type: "follow_up", priority: "normal", assigneeOrgId: "org-sanjivani", assigneeRole: "DOCTOR", createdById: "u-farah", createdByName: "Dr. Farah Sheikh", status: "pending", createdOn: daysAgo(4), dueOn: daysAgo(-2) },
  { id: "task-06", patientId: "p-01", orgId: "org-nmc", title: "Dispense discharge medication", detail: "Cefpodoxime course plus continue Metformin/Telmisartan. Patient counselled on penicillin allergy.", type: "medication_review", priority: "normal", assigneeOrgId: "org-medplus", assigneeRole: "PHARMACY", createdById: "u-vikram", createdByName: "Dr. Vikram Nair", status: "in_progress", createdOn: daysAgo(3) },
  { id: "task-07", patientId: "p-06", orgId: "org-nmc", title: "Anti-D prophylaxis check at 28 weeks", detail: "Confirm Rh status and administer anti-D if indicated.", type: "general", priority: "high", assigneeOrgId: "org-nmc", assigneeRole: "DOCTOR", createdById: "u-aroha", createdByName: "Dr. Aroha Deshpande", status: "pending", createdOn: daysAgo(5), dueOn: daysAgo(-3) },
];

/* ---------------------------------------------------------- notifications --- */
const notifications: Notification[] = [
  { id: "n-01", audienceUserId: "u-amit", title: "New access request", body: "Dr. Farah Sheikh (Sanjivani Multispecialty Hospital) is requesting access to your records for a cardiology opinion.", kind: "consent", createdOn: daysAgo(1), read: false, href: "/app/my-consents" },
  { id: "n-02", audienceOrgId: "org-nmc", audienceRole: "DOCTOR", title: "Lab result available", body: "HbA1c for Amit Kumar resulted at 8.4% (above target).", kind: "lab", createdOn: daysAgo(2), read: false, href: "/app/patients/p-01" },
  { id: "n-03", audienceOrgId: "org-pathcare", audienceRole: "LAB", title: "New urgent order", body: "Serum creatinine ordered for Amit Kumar by Dr. Aroha Deshpande.", kind: "lab", createdOn: daysAgo(1), read: false, href: "/app/lab-orders" },
  { id: "n-04", audienceOrgId: "org-medplus", audienceRole: "PHARMACY", title: "Prescription to dispense", body: "Discharge prescription rx-5001 for Amit Kumar is ready for fulfilment.", kind: "prescription", createdOn: daysAgo(3), read: true, href: "/app/prescriptions" },
  { id: "n-05", audienceOrgId: "org-nmc", audienceRole: "HOSPITAL_ADMIN", title: "Consent pending patient decision", body: "Dr. Vikram Nair's request for Iqbal Ansari's records is awaiting the patient.", kind: "consent", createdOn: daysAgo(2), read: false, href: "/app/audit" },
  { id: "n-06", audienceUserId: "u-priya", title: "Prescription dispensed", body: "Your inhaler step-up prescription was dispensed at MedPlus Community Pharmacy.", kind: "prescription", createdOn: daysAgo(6), read: true, href: "/app/my-records" },
];

/* --------------------------------------------------------------- audit --- */
const audit: AuditEvent[] = [
  { id: "a-001", ts: daysAgo(9), actorId: "u-aroha", actorName: "Dr. Aroha Deshpande", actorRole: "DOCTOR", orgId: "org-nmc", orgName: "Nashik City Medical College & Hospital", action: "consent.request", resourceType: "Consent", resourceId: "con-01", patientId: "p-04", status: "success", detail: "Requested co-management access for diabetes." },
  { id: "a-002", ts: daysAgo(9), actorId: "u-super", actorName: "System", actorRole: "PATIENT", orgId: "org-nmc", orgName: "Nashik City Medical College & Hospital", action: "consent.approve", resourceType: "Consent", resourceId: "con-01", patientId: "p-04", status: "success", detail: "Patient approved for 90 days." },
  { id: "a-003", ts: daysAgo(8), actorId: "u-aroha", actorName: "Dr. Aroha Deshpande", actorRole: "DOCTOR", orgId: "org-nmc", orgName: "Nashik City Medical College & Hospital", action: "patient.context.view", resourceType: "Patient", resourceId: "p-04", patientId: "p-04", status: "success", detail: "Unified clinical context assembled (cross-tenant, consent con-01)." },
  { id: "a-004", ts: daysAgo(3), actorId: "u-vikram", actorName: "Dr. Vikram Nair", actorRole: "DOCTOR", orgId: "org-nmc", orgName: "Nashik City Medical College & Hospital", action: "prescription.create", resourceType: "Prescription", resourceId: "rx-5001", patientId: "p-01", status: "success", detail: "Discharge prescription, 3 items. Penicillin allergy respected." },
  { id: "a-005", ts: daysAgo(2), actorId: "u-lab", actorName: "Anil Menon", actorRole: "LAB", orgId: "org-pathcare", orgName: "PathCare Diagnostics", action: "lab.result.upload", resourceType: "LabOrder", resourceId: "lab-9001", patientId: "p-01", status: "success", detail: "HbA1c 8.4% released to ordering clinician." },
  { id: "a-006", ts: daysAgo(2), actorId: "u-farah", actorName: "Dr. Farah Sheikh", actorRole: "DOCTOR", orgId: "org-sanjivani", orgName: "Sanjivani Multispecialty Hospital", action: "patient.context.view", resourceType: "Patient", resourceId: "p-01", patientId: "p-01", status: "blocked", detail: "No active consent for requesting organisation. Access denied; consent request created." },
  { id: "a-007", ts: daysAgo(1), actorId: "u-farah", actorName: "Dr. Farah Sheikh", actorRole: "DOCTOR", orgId: "org-sanjivani", orgName: "Sanjivani Multispecialty Hospital", action: "consent.request", resourceType: "Consent", resourceId: "con-03", patientId: "p-01", status: "success", detail: "Requested lab + medication scope for cardiology opinion." },
  { id: "a-008", ts: daysAgo(1), actorId: "u-aroha", actorName: "Dr. Aroha Deshpande", actorRole: "DOCTOR", orgId: "org-nmc", orgName: "Nashik City Medical College & Hospital", action: "lab.order.create", resourceType: "LabOrder", resourceId: "lab-9011", patientId: "p-01", status: "success", detail: "Serum creatinine, routine." },
  { id: "a-009", ts: daysAgo(6), actorId: "u-pharm", actorName: "Deepa Iyer", actorRole: "PHARMACY", orgId: "org-medplus", orgName: "MedPlus Community Pharmacy", action: "prescription.dispense", resourceType: "Prescription", resourceId: "rx-5010", patientId: "p-02", status: "success", detail: "Full dispense, 2 items." },
  { id: "a-010", ts: daysAgo(5), actorId: "u-sanj-admin", actorName: "Neha Kulkarni", actorRole: "HOSPITAL_ADMIN", orgId: "org-sanjivani", orgName: "Sanjivani Multispecialty Hospital", action: "staff.invite", resourceType: "User", resourceId: "u-farah", status: "success", detail: "Reactivated clinician account." },
];

export function buildSeed(): Database {
  return {
    organizations, users, patients, diagnoses, encounters,
    prescriptions, labOrders, consents, careTasks, notifications, audit,
  };
}

export const SEED_VERSION = 4;
