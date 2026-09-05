// The closed set of roles — three tiers, confirmed with the user for V2
// (replacing V1's Team/Admin/Super Admin). Adding a role is a deliberate
// code change (it needs a RolePermission seed row for every existing
// permission, not just an enum value); WHICH permissions each role has by
// default lives in the RolePermission table, not here — see
// lib/permissions.js.
export const ROLES = ["ADMIN", "CONSULTANT", "VIEWER"];

export function isValidRole(role) {
  return ROLES.includes(role);
}

export function roleLabel(role) {
  if (role === "ADMIN") return "Admin";
  if (role === "CONSULTANT") return "Consultant";
  if (role === "VIEWER") return "Viewer";
  return role;
}
