/**
 * Prototype patient records.
 *
 * This file is the only place a patient's facts are written down. Every surface
 * that shows patient information reads these records:
 *
 *   Patient Profile   one record, resolved from the route's patient id
 *   Dashboard         activeAdmissions(), derived from each record's admission
 *   Doctor History     (later milestone) will flatten `encounters` across records
 *
 * Keeping admissions derived rather than listed separately is what stops the
 * Dashboard and the record from disagreeing about who is in a bed.
 *
 * The shape is deliberately narrow: only fields a designed screen reads. A real
 * backend can replace this module without changing what the screens ask for.
 *
 * `encounters` is authored newest-first, which is the order the Profile shows.
 * Ordering by timestamp belongs to the History milestone, where it matters.
 *
 * Identities here are clinical-record facts. The Patient *login* demo accounts
 * are a separate concern and stay in js/auth/mock-auth.js.
 */

export const MOCK_PATIENTS = [
  {
    id: "p-01",
    name: "Amit Kumar",
    gender: "Male",
    dob: "1991-03-14",
    abha: {
      number: "23-4567-8912-3401",
      address: "amit.kumar@abdm",
    },
    contact: {
      phone: "98230 45671",
      address: "House 22, Panchavati, Nashik, Maharashtra 422003",
    },
    emergencyContact: { name: "Sunita Kumar", relation: "Spouse", phone: "98230 45672" },
    bloodGroup: "B+",
    heightCm: 172,
    weightKg: 81,
    chronicConditions: ["Type 2 diabetes", "Hypertension"],
    allergies: [{ substance: "Penicillin", reaction: "Rash" }],
    // The reconciled active list, not a copy of the prescriptions below: a medicine
    // can be current without a recent encounter, and stop without a new record.
    currentMedications: [
      { name: "Metformin", dosage: "500 mg", frequency: "Twice daily" },
      { name: "Telmisartan", dosage: "40 mg", frequency: "Once daily" },
    ],
    notes: [
      {
        text: "Prefers Marathi for medication instructions.",
        author: "Dr. Aroha Deshpande",
        date: "2026-06-02",
      },
      {
        text: "Family reports recurring low sugar readings when meals are skipped.",
        author: "Dr. Aroha Deshpande",
        date: "2026-08-12",
      },
    ],
    admission: {
      ward: "Ward B",
      bed: "Bed 3",
      admittedOn: "2026-09-07",
      dischargedOn: null,
    },
    encounters: [
      {
        id: "enc-1041",
        date: "2026-09-07",
        setting: "IPD",
        reason: "Fever and productive cough for 4 days",
        assessment: "Community-acquired pneumonia, moderate severity",
        disposition: "Admit",
        prescription: {
          issuedOn: "2026-09-07",
          items: [
            {
              name: "Inj. Ceftriaxone",
              dosage: "1 g",
              frequency: "Twice daily",
              duration: "5 days",
              instructions: "IV, through ward nursing",
            },
            {
              name: "Paracetamol",
              dosage: "650 mg",
              frequency: "Three times daily when needed",
              duration: "3 days",
              instructions: "Oral, after food",
            },
          ],
        },
        investigations: [
          {
            test: "Chest X-ray",
            orderedOn: "2026-09-07",
            result: "Right lower-zone consolidation",
            asOf: "2026-09-07",
          },
          {
            test: "HbA1c",
            orderedOn: "2026-09-07",
            result: "8.4 %",
            asOf: "2026-09-07",
          },
          {
            test: "Random blood glucose",
            orderedOn: "2026-09-07",
            result: "232 mg/dL",
            asOf: "2026-09-07",
          },
        ],
      },
      {
        id: "enc-0916",
        date: "2026-06-02",
        setting: "OPD",
        reason: "Diabetes review",
        assessment: "HbA1c 7.6 %. Metformin dose unchanged.",
        disposition: "Continue OPD",
        prescription: {
          issuedOn: "2026-06-02",
          items: [
            {
              name: "Metformin",
              dosage: "500 mg",
              frequency: "Twice daily",
              duration: "60 days",
              instructions: "After meals",
            },
          ],
        },
        investigations: [
          { test: "HbA1c", orderedOn: "2026-06-02", result: "7.6 %", asOf: "2026-06-03" },
        ],
      },
    ],
  },
  {
    id: "p-02",
    name: "Priya Patel",
    gender: "Female",
    dob: "1985-11-02",
    abha: {
      number: "34-5678-9123-4502",
      address: "priya.patel@abdm",
    },
    contact: {
      phone: "98500 21436",
      address: "Flat 4B, Adhal Gaon Road, Nashik, Maharashtra 422009",
    },
    emergencyContact: { name: "Nikhil Patel", relation: "Brother", phone: "98500 21437" },
    bloodGroup: "O+",
    heightCm: 160,
    weightKg: 58,
    chronicConditions: ["Asthma"],
    // Recorded as none, rather than left out, so the Profile can state it.
    allergies: [],
    currentMedications: [
      { name: "Budesonide/Formoterol inhaler", dosage: "1 puff", frequency: "Twice daily" },
    ],
    notes: [],
    admission: {
      ward: "Ward B",
      bed: "Bed 4",
      admittedOn: "2026-09-03",
      dischargedOn: "2026-09-08",
    },
    encounters: [
      {
        id: "enc-1033",
        date: "2026-09-03",
        setting: "IPD",
        reason: "Acute breathlessness",
        assessment: "Moderate asthma exacerbation, responding to nebulisation",
        disposition: "Discharge",
        prescription: {
          issuedOn: "2026-09-08",
          items: [
            {
              name: "Prednisolone",
              dosage: "40 mg",
              frequency: "Once daily",
              duration: "5 days",
              instructions: "After breakfast",
            },
          ],
        },
        investigations: [
          {
            test: "SpO2",
            orderedOn: "2026-09-08",
            result: "96 % on room air",
            asOf: "2026-09-08",
          },
          {
            test: "Peak flow",
            orderedOn: "2026-09-03",
            result: "62 % of predicted",
            asOf: "2026-09-03",
          },
        ],
      },
    ],
  },
  {
    id: "p-03",
    name: "Rahul Sharma",
    gender: "Male",
    dob: "1978-07-21",
    abha: {
      number: "45-6789-1234-5603",
      address: "rahul.sharma@abdm",
    },
    contact: {
      phone: "98909 76512",
      address: "Shop 3, CDI Road, Nashik, Maharashtra 422005",
    },
    emergencyContact: { name: "Meena Sharma", relation: "Spouse", phone: "98909 76513" },
    bloodGroup: "A-",
    heightCm: 175,
    weightKg: 70,
    chronicConditions: [],
    allergies: [{ substance: "Sulfa drugs", reaction: "Hives" }],
    currentMedications: [],
    notes: [
      {
        text: "Did not return after the 2025 review; contact number may have changed.",
        author: "Dr. Aroha Deshpande",
        date: "2026-02-11",
      },
    ],
    admission: null,
    encounters: [
      {
        id: "enc-0820",
        date: "2026-02-11",
        setting: "OPD",
        reason: "Lower back pain for 2 weeks",
        assessment: "Mechanical lumbar pain, no radiculopathy",
        disposition: "Continue OPD",
        prescription: {
          issuedOn: "2026-02-11",
          items: [
            {
              name: "Naproxen",
              dosage: "500 mg",
              frequency: "Twice daily",
              duration: "7 days",
              instructions: "With food",
            },
          ],
        },
        investigations: [
          {
            test: "X-ray lumbar spine",
            orderedOn: "2026-02-11",
            result: "No fracture. Mild degenerative change L4-L5.",
            asOf: "2026-02-12",
          },
        ],
      },
    ],
  },
];

/**
 * The record for a patient id, or null. `null` is a meaningful answer: a stale
 * bookmark must not show the last patient the doctor looked at.
 */
export function getPatientById(patientId) {
  if (!patientId) return null;
  return MOCK_PATIENTS.find((patient) => patient.id === patientId) ?? null;
}

/**
 * Current clinical state, derived from the admission data instead of stored next
 * to it, so the two can never drift apart. States no record represents
 * (In consultation, Transferred, DAMA) are absent because Disposition is an
 * Encounter function and that milestone has not been designed yet.
 */
export function patientStateOf(patient) {
  const admission = patient?.admission;

  if (!admission) {
    return { kind: "outpatient" };
  }
  if (admission.dischargedOn) {
    return { kind: "discharged", admittedOn: admission.admittedOn, dischargedOn: admission.dischargedOn };
  }
  return { kind: "admitted", ward: admission.ward, bed: admission.bed, admittedOn: admission.admittedOn };
}

/**
 * Rows for the Dashboard's Active Admissions list: the patients in a bed right
 * now, by ward then bed. Empty beds are not admissions, so they are not here.
 */
export function activeAdmissions() {
  return MOCK_PATIENTS.filter((patient) => patientStateOf(patient).kind === "admitted")
    .map((patient) => {
      const state = patientStateOf(patient);
      return {
        id: patient.id,
        name: patient.name,
        ward: state.ward,
        bed: state.bed,
        admittedOn: state.admittedOn,
      };
    })
    .sort((a, b) => a.ward.localeCompare(b.ward) || a.bed.localeCompare(b.bed, undefined, { numeric: true }));
}

/**
 * The newest recorded value per investigation, newest first. This is what the
 * Profile shows as health markers, so the same numbers are never written down
 * twice: they stay where they were recorded, inside the encounter.
 */
export function latestInvestigationResults(patient) {
  const newestByTest = new Map();

  for (const encounter of patient?.encounters ?? []) {
    for (const item of encounter.investigations) {
      const current = newestByTest.get(item.test);
      if (!current || item.asOf > current.asOf) {
        newestByTest.set(item.test, item);
      }
    }
  }

  // ISO dates compare correctly as text, which keeps this dependency-free.
  return [...newestByTest.values()].sort((a, b) => b.asOf.localeCompare(a.asOf));
}
