import { describe, it, expect } from "vitest";
import { applyReviewAction, isDiscountCovered } from "./policy.js";

const consultant = { id: "u1", name: "Ana Reyes", isCsmoApprover: false, isCooApprover: false, isSupervisor: false };
const csmo = { id: "u2", name: "Beth Cruz", isCsmoApprover: true, isCooApprover: false, isSupervisor: false };
const coo = { id: "u3", name: "Carl Diaz", isCsmoApprover: false, isCooApprover: true, isSupervisor: false };
const supervisor = { id: "u4", name: "Dee Santos", isCsmoApprover: false, isCooApprover: false, isSupervisor: true };
// A real V1 case, called out in both V1's and V2's schema comments: one
// person can legitimately hold both approver flags.
const both = { id: "u5", name: "Evan Cruz", isCsmoApprover: true, isCooApprover: true, isSupervisor: false };

function pending(kind = "DISCOUNT") {
  return { id: "r1", kind, status: "PENDING" };
}

describe("already resolved/declined — rejected outright", () => {
  it("RESOLVED", () => {
    const result = applyReviewAction({ request: { ...pending(), status: "RESOLVED" }, actor: csmo, action: "APPROVE", note: null, tier: {} });
    expect(result).toEqual({ ok: false, status: 410, error: "This request has already been resolved." });
  });

  it("DECLINED", () => {
    const result = applyReviewAction({ request: { ...pending(), status: "DECLINED" }, actor: csmo, action: "APPROVE", note: null, tier: {} });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(410);
  });
});

describe("SUPERVISOR kind", () => {
  it("a non-Supervisor is rejected", () => {
    const result = applyReviewAction({ request: pending("SUPERVISOR"), actor: consultant, action: "NOTE", note: "looks fine", tier: {} });
    expect(result).toEqual({ ok: false, status: 403, error: expect.stringContaining("not designated as a Supervisor") });
  });

  it("a note is required", () => {
    const result = applyReviewAction({ request: pending("SUPERVISOR"), actor: supervisor, action: "NOTE", note: "  ", tier: {} });
    expect(result).toEqual({ ok: false, status: 400, error: "A note is required." });
  });

  it("NOTE resolves the request", () => {
    const result = applyReviewAction({ request: pending("SUPERVISOR"), actor: supervisor, action: "NOTE", note: "Looks good", tier: {} });
    expect(result.ok).toBe(true);
    expect(result.data.status).toBe("RESOLVED");
    expect(result.data.finalActedById).toBe(supervisor.id);
    expect(result.data.finalNote).toBe("Looks good");
    expect(result.auditMessage).toContain("noted by Dee Santos");
  });

  it("DECLINE flags it instead of resolving", () => {
    const result = applyReviewAction({ request: pending("SUPERVISOR"), actor: supervisor, action: "DECLINE", note: "Missing signature page", tier: {} });
    expect(result.data.status).toBe("DECLINED");
    expect(result.auditMessage).toContain("flagged by Dee Santos");
  });

  it("an unrecognized action is rejected", () => {
    const result = applyReviewAction({ request: pending("SUPERVISOR"), actor: supervisor, action: "APPROVE", note: "x", tier: {} });
    expect(result).toEqual({ ok: false, status: 400, error: "Invalid action for a Supervisor review." });
  });
});

describe("DISCOUNT kind — PENDING, tier CSMO (5-10%)", () => {
  const tier = { tier: "CSMO", monthlyPct: 7, setupPct: 0 };

  it("a non-CSMO-approver is rejected", () => {
    const result = applyReviewAction({ request: pending(), actor: consultant, action: "APPROVE", note: null, tier });
    expect(result).toEqual({ ok: false, status: 403, error: expect.stringContaining("not designated as a CSMO Approver") });
  });

  it("APPROVE resolves directly with resolvedTier CSMO and the live percentages recorded", () => {
    const result = applyReviewAction({ request: pending(), actor: csmo, action: "APPROVE", note: "ok", tier });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ status: "RESOLVED", resolvedTier: "CSMO", resolvedMonthlyPct: 7, resolvedSetupPct: 0 });
    expect(result.auditMessage).toContain("approved by Beth Cruz (CSMO)");
  });

  it("CONCUR also resolves directly at this tier (not held for a COO)", () => {
    const result = applyReviewAction({ request: pending(), actor: csmo, action: "CONCUR", note: null, tier });
    expect(result.data.status).toBe("RESOLVED");
  });

  it("DECLINE requires a note and the current-stage approver", () => {
    expect(applyReviewAction({ request: pending(), actor: csmo, action: "DECLINE", note: "", tier })).toEqual({
      ok: false, status: 400, error: "A reason is required to decline.",
    });
    expect(applyReviewAction({ request: pending(), actor: consultant, action: "DECLINE", note: "too much", tier }).status).toBe(403);
    const declined = applyReviewAction({ request: pending(), actor: csmo, action: "DECLINE", note: "too much", tier });
    expect(declined.data.status).toBe("DECLINED");
  });
});

describe("DISCOUNT kind — PENDING, tier COO (>10%) — CSMO must concur first", () => {
  const tier = { tier: "COO", monthlyPct: 14, setupPct: 0 };

  it("APPROVE (skipping concurrence) is rejected", () => {
    const result = applyReviewAction({ request: pending(), actor: csmo, action: "APPROVE", note: null, tier });
    expect(result).toEqual({ ok: false, status: 400, error: expect.stringContaining("concur first") });
  });

  it("CONCUR moves it to AWAITING_COO, not RESOLVED", () => {
    const result = applyReviewAction({ request: pending(), actor: csmo, action: "CONCUR", note: "escalating", tier });
    expect(result.data).toMatchObject({ status: "AWAITING_COO", csmoActedById: csmo.id, csmoNote: "escalating" });
    expect(result.data.resolvedTier).toBeUndefined();
    expect(result.auditMessage).toContain("awaiting COO/Finance Head approval");
  });
});

describe("DISCOUNT kind — AWAITING_COO", () => {
  const tier = { tier: "COO", monthlyPct: 14, setupPct: 0 };
  const awaitingCoo = { id: "r1", kind: "DISCOUNT", status: "AWAITING_COO" };

  it("a non-COO-approver is rejected, even a CSMO approver", () => {
    const result = applyReviewAction({ request: awaitingCoo, actor: csmo, action: "APPROVE", note: null, tier });
    expect(result.status).toBe(403);
  });

  it("APPROVE resolves with resolvedTier COO", () => {
    const result = applyReviewAction({ request: awaitingCoo, actor: coo, action: "APPROVE", note: "approved", tier });
    expect(result.data).toMatchObject({ status: "RESOLVED", resolvedTier: "COO", resolvedMonthlyPct: 14, resolvedSetupPct: 0 });
    expect(result.auditMessage).toContain("final approval by Carl Diaz (COO/Finance Head)");
  });

  it("DECLINE at this stage checks isCooApprover, not isCsmoApprover — one person can hold both flags and act at both stages", () => {
    const result = applyReviewAction({ request: awaitingCoo, actor: both, action: "DECLINE", note: "changed my mind", tier });
    expect(result.data.status).toBe("DECLINED");
    expect(result.data.finalActedById).toBe(both.id);
  });
});

describe("isDiscountCovered", () => {
  const resolved = { status: "RESOLVED", resolvedMonthlyPct: 8, resolvedSetupPct: 0 };

  it("covered when the current % is at or below what was approved", () => {
    expect(isDiscountCovered(resolved, 8, 0)).toBe(true);
    expect(isDiscountCovered(resolved, 5, 0)).toBe(true);
  });

  it("NOT covered when the discount was raised again after approval — even staying under the same tier band", () => {
    expect(isDiscountCovered(resolved, 9.5, 0)).toBe(false);
  });

  it("NOT covered by a request that isn't RESOLVED, or that doesn't exist", () => {
    expect(isDiscountCovered({ status: "PENDING", resolvedMonthlyPct: 8 }, 5, 0)).toBe(false);
    expect(isDiscountCovered(null, 0, 0)).toBe(false);
  });
});
