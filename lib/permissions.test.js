import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma.js";
import { requirePermission } from "./permissions.js";

// Integration-style: exercises the real centralized check against the real
// DB, rather than mocking Prisma — this is the one function every route in
// the app is supposed to call, so it's worth testing against the real
// seeded RolePermission rows rather than a fake in-memory stand-in that
// could quietly drift from what's actually seeded.
//
// All fixture users are created here and torn down in afterAll —
// deliberately NOT relying on prisma/seed.mjs's admin account or any
// user left over from manual verification, since a test that depends on
// incidental external state breaks the moment that state changes for an
// unrelated reason (this test did exactly that once already, when a
// manually-inserted viewer test account used only for live Phase 1
// verification was cleaned up afterward).

function fakeReq(token) {
  return { headers: { get: (name) => (name === "authorization" && token ? `Bearer ${token}` : null) } };
}

function tokenFor(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

let adminUser, viewerUser, deactivatedUser;

beforeAll(async () => {
  adminUser = await prisma.user.upsert({
    where: { email: "admin-permtest@yahshua.test" },
    update: { isActive: true, role: "ADMIN" },
    create: { email: "admin-permtest@yahshua.test", passwordHash: "unused", name: "Admin Test User", role: "ADMIN" },
  });
  viewerUser = await prisma.user.upsert({
    where: { email: "viewer-permtest@yahshua.test" },
    update: { isActive: true, role: "VIEWER" },
    create: { email: "viewer-permtest@yahshua.test", passwordHash: "unused", name: "Viewer Test User", role: "VIEWER" },
  });
  deactivatedUser = await prisma.user.upsert({
    where: { email: "deactivated-permtest@yahshua.test" },
    update: { isActive: false },
    create: {
      email: "deactivated-permtest@yahshua.test",
      passwordHash: "unused",
      name: "Deactivated Test User",
      role: "ADMIN",
      isActive: false,
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, viewerUser.id, deactivatedUser.id] } } });
  await prisma.$disconnect();
});

describe("requirePermission", () => {
  it("rejects with 401 when there's no token", async () => {
    const result = await requirePermission(fakeReq(null), "agreement.finalize");
    expect(result).toEqual({ ok: false, status: 401, error: "Unauthorized" });
  });

  it("grants a permission the role actually has (Admin -> agreement.finalize)", async () => {
    const result = await requirePermission(fakeReq(tokenFor(adminUser)), "agreement.finalize");
    expect(result.ok).toBe(true);
    expect(result.user.id).toBe(adminUser.id);
  });

  it("rejects with 403 when the role lacks the permission (Viewer -> agreement.finalize)", async () => {
    const result = await requirePermission(fakeReq(tokenFor(viewerUser)), "agreement.finalize");
    expect(result).toEqual({ ok: false, status: 403, error: "Forbidden" });
  });

  it("rejects a deactivated user with 401 even with a valid, unexpired token and an otherwise-privileged role", async () => {
    const result = await requirePermission(fakeReq(tokenFor(deactivatedUser)), "agreement.finalize");
    expect(result).toEqual({ ok: false, status: 401, error: "Unauthorized" });
  });

  it("rejects an unknown/unseeded permission key outright (typo-safe: no permission row means no access, never a silent pass)", async () => {
    const result = await requirePermission(fakeReq(tokenFor(adminUser)), "agreement.this_key_does_not_exist");
    expect(result).toEqual({ ok: false, status: 403, error: "Forbidden" });
  });
});
