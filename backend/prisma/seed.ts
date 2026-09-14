/**
 * Database seed — baseline tenant registry.
 *
 * Phase 2 seeds the five demo tenants so the platform has a stable
 * organizational root. The full demo-data replay (users, patients,
 * encounters, prescriptions, lab orders, consents, care tasks, audit events —
 * mirroring the frontend's `src/data/seed.ts` 1:1) lands with the read/write
 * API phases, when the seed shapes are exercised end-to-end by the service
 * layer.
 *
 * All data here is SYNTHETIC demo data, as in the frontend.
 *
 * Run: `npm run db:seed` (idempotent — upserts by unique code).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type TenantType = "hospital" | "lab" | "pharmacy" | "platform";

interface TenantSeed {
  code: string;
  name: string;
  type: TenantType;
  city: string;
  state: string;
}

const organizations: TenantSeed[] = [
  { code: "NEXUS", name: "Jan Arogya Nexus", type: "platform", city: "Bengaluru", state: "Karnataka" },
  { code: "NMC-NAS", name: "Nashik City Medical College & Hospital", type: "hospital", city: "Nashik", state: "Maharashtra" },
  { code: "SANJ-PUN", name: "Sanjivani Multispecialty Hospital", type: "hospital", city: "Pune", state: "Maharashtra" },
  { code: "PATH-NAS", name: "PathCare Diagnostics", type: "lab", city: "Nashik", state: "Maharashtra" },
  { code: "MEDP-NAS", name: "MedPlus Community Pharmacy", type: "pharmacy", city: "Nashik", state: "Maharashtra" },
];

async function main(): Promise<void> {
  for (const org of organizations) {
    await prisma.organization.upsert({
      where: { code: org.code },
      update: org,
      create: org,
    });
  }
  const count = await prisma.organization.count();
  console.log(`Seeded ${organizations.length} tenants (total organizations: ${count}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
