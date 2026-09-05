import { describe, it, expect } from "vitest";
import { computeEffectiveDiscountPct, requiredApprovalTier, getRequiredApprovalTier } from "./discountApproval.js";

const ctx = { rateCardId: "rc-direct", lockinYears: 1, vatRatePct: 12 };

describe("computeEffectiveDiscountPct — no catalog rules, a COMPONENT-scoped QuoteAdjustment", () => {
  // Real Direct Payroll subscription number from lib/pricing/engine.test.js
  // / the seeded rate card: 150 employees = PHP 10,000/mo gross, no catalog
  // waiver applies at Direct's 1-year lock-in.
  const lines = [{ chargeKind: "RECURRING", componentId: "payroll-sub", productId: "payroll", grossAmount: 10000, catalogRules: [] }];

  it("a 5.5% PERCENT_OFF quote adjustment reduces net to 9,450 and reports 5.5% effective — crossing into the CSMO tier", () => {
    const adjustments = [{ id: "adj1", scope: "COMPONENT", componentId: "payroll-sub", appliesToChargeKind: "RECURRING", effectType: "PERCENT_OFF", effectValue: 5.5 }];
    const { monthlyPct, setupPct } = computeEffectiveDiscountPct(lines, adjustments, ctx);
    expect(monthlyPct).toBeCloseTo(5.5, 5);
    expect(setupPct).toBe(0);
    expect(requiredApprovalTier(monthlyPct)).toBe("CSMO");
  });

  it("a 15% PERCENT_OFF quote adjustment crosses into the COO tier", () => {
    const adjustments = [{ id: "adj2", scope: "COMPONENT", componentId: "payroll-sub", effectType: "PERCENT_OFF", effectValue: 15 }];
    const { monthlyPct } = computeEffectiveDiscountPct(lines, adjustments, ctx);
    expect(monthlyPct).toBeCloseTo(15, 5);
    expect(requiredApprovalTier(monthlyPct)).toBe("COO");
  });

  it("a WAIVE quote adjustment reports 100% effective", () => {
    const adjustments = [{ id: "adj3", scope: "COMPONENT", componentId: "payroll-sub", effectType: "WAIVE" }];
    const { monthlyPct } = computeEffectiveDiscountPct(lines, adjustments, ctx);
    expect(monthlyPct).toBe(100);
  });

  it("an adjustment scoped to a different component doesn't touch this line", () => {
    const adjustments = [{ id: "adj4", scope: "COMPONENT", componentId: "some-other-component", effectType: "WAIVE" }];
    expect(computeEffectiveDiscountPct(lines, adjustments, ctx).monthlyPct).toBe(0);
  });

  it("an adjustment scoped to ONE_TIME doesn't touch a RECURRING line", () => {
    const adjustments = [{ id: "adj5", scope: "COMPONENT", componentId: "payroll-sub", appliesToChargeKind: "ONE_TIME", effectType: "WAIVE" }];
    expect(computeEffectiveDiscountPct(lines, adjustments, ctx).monthlyPct).toBe(0);
  });

  it("a QUOTE_TOTAL-scoped adjustment applies regardless of componentId", () => {
    const adjustments = [{ id: "adj6", scope: "QUOTE_TOTAL", effectType: "PERCENT_OFF", effectValue: 8 }];
    expect(computeEffectiveDiscountPct(lines, adjustments, ctx).monthlyPct).toBeCloseTo(8, 5);
  });
});

describe("computeEffectiveDiscountPct — a catalog rule already covers the line", () => {
  // The real Globe/LMI 3-year lock-in payroll setup waiver from
  // prisma/seedPricing.mjs: at lockinYears >= 3, the catalog itself
  // already waives the PHP 25,000 setup fee to 0. A further quote
  // adjustment on an already-zero baseline can't register as an
  // additional "concession" — matches V1's own pctReduction guard
  // (baselineAmount <= 0 => 0%), not a bug introduced here.
  const catalogWaiver = { id: "globe-waiver", effectType: "WAIVE", conditions: [{ type: "LOCKIN_YEARS_AT_LEAST", intValue: 3 }] };
  const lines = [{ chargeKind: "ONE_TIME", componentId: "payroll-setup", productId: "payroll", grossAmount: 25000, catalogRules: [catalogWaiver] }];

  it("baseline is already 0 (catalog-only), so effective % stays 0 regardless of any quote adjustment on top", () => {
    const adjustments = [{ id: "adj7", scope: "COMPONENT", componentId: "payroll-setup", effectType: "PERCENT_OFF", effectValue: 10 }];
    const ctxAt3Years = { ...ctx, lockinYears: 3 };
    expect(computeEffectiveDiscountPct(lines, adjustments, ctxAt3Years).setupPct).toBe(0);
  });

  it("below the 3-year threshold the catalog rule doesn't apply, so a quote adjustment IS a real concession", () => {
    const adjustments = [{ id: "adj8", scope: "COMPONENT", componentId: "payroll-setup", effectType: "PERCENT_OFF", effectValue: 10 }];
    const ctxBelow3Years = { ...ctx, lockinYears: 2 };
    expect(computeEffectiveDiscountPct(lines, adjustments, ctxBelow3Years).setupPct).toBeCloseTo(10, 5);
  });
});

describe("getRequiredApprovalTier — highest of Monthly/Setup wins", () => {
  it("a small Monthly discount (NONE tier) alongside a large Setup discount (COO tier) requires COO overall", () => {
    const lines = [
      { chargeKind: "RECURRING", componentId: "a", grossAmount: 10000, catalogRules: [] },
      { chargeKind: "ONE_TIME", componentId: "b", grossAmount: 25000, catalogRules: [] },
    ];
    const adjustments = [
      { id: "m", scope: "COMPONENT", componentId: "a", effectType: "PERCENT_OFF", effectValue: 3 },
      { id: "s", scope: "COMPONENT", componentId: "b", effectType: "PERCENT_OFF", effectValue: 12 },
    ];
    const { tier, monthlyPct, setupPct } = getRequiredApprovalTier(lines, adjustments, ctx);
    expect(monthlyPct).toBeCloseTo(3, 5);
    expect(setupPct).toBeCloseTo(12, 5);
    expect(tier).toBe("COO");
  });

  it("no adjustments at all requires no approval", () => {
    const lines = [{ chargeKind: "RECURRING", componentId: "a", grossAmount: 10000, catalogRules: [] }];
    expect(getRequiredApprovalTier(lines, [], ctx).tier).toBe("NONE");
  });
});
