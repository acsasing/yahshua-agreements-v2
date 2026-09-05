import { prisma } from "./prisma.js";
import { getUserFromRequest } from "./auth.js";

// The single, centralized permission check every API route should call —
// replacing V1's ~20 separately copy-pasted `if (!isAdminRole(user.role))
// return 403` checks scattered across route files (a missing check in any
// one of those files was a silent security hole; this makes it one thing
// to get right instead of many).
//
// Always re-fetches the user's CURRENT role from the DB rather than
// trusting the JWT's role claim — same reasoning as V1's job-function-flag
// checks: a role change should take effect immediately, not after the
// token's 7-day expiry, and a deactivated account must be rejected even
// with a still-valid token.
//
// Returns { ok: true, user } or { ok: false, status, error } — callers
// should return that error/status directly rather than re-deriving it:
//
//   const check = await requirePermission(req, "agreement.finalize");
//   if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
//   const { user } = check;
export async function requirePermission(req, permissionKey) {
  const claim = getUserFromRequest(req);
  if (!claim) return { ok: false, status: 401, error: "Unauthorized" };

  const user = await prisma.user.findUnique({ where: { id: claim.id } });
  if (!user || !user.isActive) return { ok: false, status: 401, error: "Unauthorized" };

  const granted = await prisma.rolePermission.findUnique({
    where: { role_permissionKey: { role: user.role, permissionKey } },
  });
  if (!granted) return { ok: false, status: 403, error: "Forbidden" };

  return { ok: true, user };
}

// For the (rare) case a route just needs to know who's asking without
// gating on a specific permission — e.g. "list my own draft agreements."
// Still re-fetches from the DB so a deactivated account is rejected
// immediately, same as requirePermission.
export async function requireAuth(req) {
  const claim = getUserFromRequest(req);
  if (!claim) return { ok: false, status: 401, error: "Unauthorized" };
  const user = await prisma.user.findUnique({ where: { id: claim.id } });
  if (!user || !user.isActive) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, user };
}

// Used by the client-side UI to decide what to render — fetch once at
// login and after any role/permission change, not on every render.
export async function getPermissionsForRole(role) {
  const rows = await prisma.rolePermission.findMany({ where: { role } });
  return rows.map((r) => r.permissionKey);
}
