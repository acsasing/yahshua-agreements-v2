import { describe, it, expect } from "vitest";
import { evaluateRuleSet, resolveRulesForRateCard } from "./rules.js";

describe("evaluateRuleSet", () => {
  it("a rule with ZERO conditions is unconditional — this is how HRIS's setup fee is always waived, no lock-in required, and it's expressed once on the component (never silently present in one code path and absent from another, unlike V1)", () => {
    const rules = [{ id: "r1", isActive: true, effectType: "WAIVE", conditions: [] }];
    const result = evaluateRuleSet(rules, 50000, {});
    expect(result.netAmount).toBe(0);
    expect(result.discountAmount).toBe(50000);
  });

  it("lock-in threshold waiver: met vs. not met (Direct Accounting's real 3-year threshold)", () => {
    const rules = [
      { id: "r1", isActive: true, effectType: "WAIVE", conditions: [{ type: "LOCKIN_YEARS_AT_LEAST", intValue: 3 }] },
    ];
    const notMet = evaluateRuleSet(rules, 80000, { lockinYears: 2 });
    const met = evaluateRuleSet(rules, 80000, { lockinYears: 3 });
    expect(notMet.netAmount).toBe(80000); // no waiver fires — full setup fee still due
    expect(met.netAmount).toBe(0);
  });

  it("appliesToChargeKind scopes a rule to only ONE_TIME or only RECURRING, never both", () => {
    const setupOnlyWaiver = {
      id: "r1",
      isActive: true,
      effectType: "WAIVE",
      appliesToChargeKind: "ONE_TIME",
      conditions: [],
    };
    const monthly = evaluateRuleSet([setupOnlyWaiver], 7000, { chargeKind: "RECURRING" });
    const setup = evaluateRuleSet([setupOnlyWaiver], 35000, { chargeKind: "ONE_TIME" });
    expect(monthly.netAmount).toBe(7000); // the monthly component is untouched
    expect(setup.netAmount).toBe(0); // only the setup component is waived
  });

  it("multiple percent/fixed discounts are additive against the ORIGINAL gross, then summed and clamped at zero (never compounding)", () => {
    const rules = [
      { id: "r1", isActive: true, effectType: "PERCENT_OFF", effectValue: 20, conditions: [] },
      { id: "r2", isActive: true, effectType: "FIXED_OFF", effectValue: 500, conditions: [] },
    ];
    const result = evaluateRuleSet(rules, 1000, {});
    // 20% of 1000 = 200, plus a flat 500 -> 700 total discount, net = 300
    expect(result.discountAmount).toBe(700);
    expect(result.netAmount).toBe(300);
  });

  it("stacked discounts clamp at zero rather than going negative", () => {
    const rules = [
      { id: "r1", isActive: true, effectType: "FIXED_OFF", effectValue: 800, conditions: [] },
      { id: "r2", isActive: true, effectType: "FIXED_OFF", effectValue: 800, conditions: [] },
    ];
    const result = evaluateRuleSet(rules, 1000, {});
    expect(result.netAmount).toBe(0);
    expect(result.discountAmount).toBe(1000); // clamped, not 1600
  });

  it("baseline vs. actual concession % — replaces V1's DISCOUNT_FIELD_KEYS hack entirely (no field-name list to maintain)", () => {
    const catalogRules = [
      { id: "cat1", isActive: true, effectType: "WAIVE", conditions: [] }, // e.g. HRIS's standing 100%-off promo
    ];
    const quoteAdjustments = [
      { id: "adj1", isActive: true, effectType: "PERCENT_OFF", effectValue: 15, conditions: [] },
    ];
    const gross = 4000;
    const baseline = evaluateRuleSet(catalogRules, gross, {});
    const actual = evaluateRuleSet([...catalogRules, ...quoteAdjustments], gross, {});
    // Both resolve to a full waiver here (WAIVE short-circuits), so the
    // concession is 0% — a Consultant "discounting" an already-waived line
    // isn't a real concession, and this falls out with no special case.
    expect(baseline.netAmount).toBe(0);
    expect(actual.netAmount).toBe(0);
    const concessionPct = baseline.netAmount === 0 ? 0 : (baseline.netAmount - actual.netAmount) / baseline.netAmount;
    expect(concessionPct).toBe(0);
  });

  it("baseline vs. actual on a component with NO standing waiver correctly measures the real concession", () => {
    const quoteAdjustments = [
      { id: "adj1", isActive: true, effectType: "PERCENT_OFF", effectValue: 15, conditions: [] },
    ];
    const gross = 10000;
    const baseline = evaluateRuleSet([], gross, {});
    const actual = evaluateRuleSet(quoteAdjustments, gross, {});
    const concessionPct = (baseline.netAmount - actual.netAmount) / baseline.netAmount;
    expect(concessionPct).toBeCloseTo(0.15, 5); // a real 15% concession, correctly measured
  });
});

describe("resolveRulesForRateCard", () => {
  it("a rate-card-scoped rule replaces the null-scoped rule for the same key (Sterling's 2-year waiver vs. everyone else's 3-year)", () => {
    const rules = [
      { id: "generic", key: "payroll.setup.lockin-waiver", rateCardId: null, effectType: "WAIVE", conditions: [{ type: "LOCKIN_YEARS_AT_LEAST", intValue: 3 }] },
      { id: "sterling", key: "payroll.setup.lockin-waiver", rateCardId: "sterling", effectType: "WAIVE", conditions: [{ type: "LOCKIN_YEARS_AT_LEAST", intValue: 2 }] },
    ];
    const forSterling = resolveRulesForRateCard(rules, "sterling");
    const forDirect = resolveRulesForRateCard(rules, "direct");
    expect(forSterling.map((r) => r.id)).toEqual(["sterling"]);
    expect(forDirect.map((r) => r.id)).toEqual(["generic"]);
  });

  it("rules with different keys always union, regardless of rate card", () => {
    const rules = [
      { id: "a", key: "rule.a", rateCardId: null, conditions: [] },
      { id: "b", key: "rule.b", rateCardId: "direct", conditions: [] },
    ];
    const forDirect = resolveRulesForRateCard(rules, "direct");
    expect(forDirect.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });
});
