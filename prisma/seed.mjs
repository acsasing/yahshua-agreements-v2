import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Duplicated from lib/permissionCatalog.js and lib/roles.js rather than
// imported: package.json has no "type": "module" (matching V1 exactly),
// so this plain-Node `.mjs` script can't import those plain `.js` files —
// Node would try to parse their `export` syntax as CommonJS and fail.
// Next.js's own bundler handles that fine for everything the app itself
// imports; only this standalone script, run outside the bundler, hits the
// interop problem. V1 hit the same wall and solved it the same way (its
// own seed.mjs inlines VALID_ROLES rather than importing lib/roles.js).
// Keep these two arrays in sync with lib/permissionCatalog.js and
// lib/roles.js by hand.
const ROLES = ["ADMIN", "CONSULTANT", "VIEWER"];
const PERMISSIONS = [
  { key: "agreement.create", label: "Create agreements", category: "Agreements" },
  { key: "agreement.edit", label: "Edit draft agreements", category: "Agreements" },
  { key: "agreement.finalize", label: "Finalize agreements", category: "Agreements" },
  { key: "agreement.delete", label: "Delete agreements", category: "Agreements" },
  { key: "agreement.view_all", label: "View every agreement (not just your own)", category: "Agreements" },
  { key: "pricing.edit", label: "Edit pricing components, products, and rate cards", category: "Back Office" },
  { key: "template.edit", label: "Edit document templates", category: "Back Office" },
  { key: "template.publish", label: "Publish a document template's draft version live", category: "Back Office" },
  { key: "partner.manage", label: "Add or edit partners and issuing entities", category: "Back Office" },
  { key: "user.manage", label: "Invite, deactivate, and change the role of other users", category: "Users" },
  { key: "user.manage_permissions", label: "Edit the permission matrix itself", category: "Users" },
  { key: "report.view", label: "View Reports", category: "Reporting" },
  { key: "report.export", label: "Export finalized-agreement data", category: "Reporting" },
];
const DEFAULT_ROLE_PERMISSIONS = {
  ADMIN: PERMISSIONS.map((p) => p.key),
  CONSULTANT: ["agreement.create", "agreement.edit", "agreement.finalize", "report.view"],
  VIEWER: ["agreement.view_all", "report.view"],
};

async function main() {
  // Permission catalog + default role assignments — upserted so re-running
  // the seed after adding a new permission key doesn't clobber any Back
  // Office edits already made to an EXISTING key's role assignments.
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { label: p.label, description: p.description ?? null, category: p.category },
      create: p,
    });
  }

  for (const role of ROLES) {
    const keys = DEFAULT_ROLE_PERMISSIONS[role] || [];
    for (const permissionKey of keys) {
      await prisma.rolePermission.upsert({
        where: { role_permissionKey: { role, permissionKey } },
        update: {},
        create: { role, permissionKey },
      });
    }
  }

  // Initial Admin account — change this password immediately after first
  // login. No self-signup exists (or should ever exist) in this app;
  // every other account is created by an Admin from Back Office.
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@yahshua.test";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: "V2 Admin",
      role: "ADMIN",
    },
  });

  // Carried forward from V1 (shared/pricing.js's ABBA_INFO/ISSUING_ENTITIES)
  // for migration continuity — real V1 data supersedes this once the
  // actual V1->V2 migration script (Phase 4) runs against production data.
  await prisma.entity.upsert({
    where: { id: "seed-entity-tai" },
    update: {},
    create: {
      id: "seed-entity-tai",
      name: "The ABBA Initiative, OPC",
      shortName: "ABBA",
      address1: "Unit #12 2F E-Max Bldg. B 71, L 5, Phase 4, Xavier Estates",
      address2: "Masterson Avenue, Upper Balulang, Cagayan de Oro City",
      address3: "Misamis Oriental, Philippines 9000",
      signatoryName: "Ptr. Ronnel E. Bayron",
      signatoryTitle: "Chief Executive Officer",
      contactEmail: "ronbayron@abba.works",
      bankName: "Rizal Commercial Banking Corporation (RCBC)",
    },
  });

  console.log(`Seeded ${PERMISSIONS.length} permissions, ${ROLES.length} roles, 1 admin (${adminEmail}), 1 entity.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
