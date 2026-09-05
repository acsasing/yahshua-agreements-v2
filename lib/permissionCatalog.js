// The code-owned catalog of permission keys. Adding a new capability is a
// deliberate code change (a matching check has to exist somewhere for the
// key to mean anything) — but WHICH roles get which key by default is
// pure data (RolePermission, seeded below and editable from Back Office
// without a deploy). This file is also what the seed script and the Back
// Office "Roles & Permissions" admin screen both read from, so the two
// never drift apart.

export const PERMISSIONS = [
  // Agreements
  { key: "agreement.create", label: "Create agreements", category: "Agreements" },
  { key: "agreement.edit", label: "Edit draft agreements", category: "Agreements" },
  { key: "agreement.finalize", label: "Finalize agreements", category: "Agreements" },
  { key: "agreement.delete", label: "Delete agreements", category: "Agreements" },
  { key: "agreement.view_all", label: "View every agreement (not just your own)", category: "Agreements" },

  // Back Office — pricing & documents (Phase 2/3 land the actual editors;
  // the permission keys exist now so the role/permission matrix is
  // complete from day one)
  { key: "pricing.edit", label: "Edit pricing components, products, and rate cards", category: "Back Office" },
  { key: "template.edit", label: "Edit document templates", category: "Back Office" },
  { key: "template.publish", label: "Publish a document template's draft version live", category: "Back Office" },
  { key: "partner.manage", label: "Add or edit partners and issuing entities", category: "Back Office" },

  // Users & roles
  { key: "user.manage", label: "Invite, deactivate, and change the role of other users", category: "Users" },
  { key: "user.manage_permissions", label: "Edit the permission matrix itself", category: "Users" },

  // Reporting & export
  { key: "report.view", label: "View Reports", category: "Reporting" },
  { key: "report.export", label: "Export finalized-agreement data", category: "Reporting" },
];

// Sensible defaults per role — seeded once, editable afterward from Back
// Office without a code change. Admin gets everything; Consultant gets
// the day-to-day agreement work; Viewer is read-only by default.
export const DEFAULT_ROLE_PERMISSIONS = {
  ADMIN: PERMISSIONS.map((p) => p.key),
  CONSULTANT: [
    "agreement.create",
    "agreement.edit",
    "agreement.finalize",
    "report.view",
  ],
  VIEWER: [
    "agreement.view_all",
    "report.view",
  ],
};
