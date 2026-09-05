import { describe, it, expect } from "vitest";
import { priceComponent, applyScopeRules, applyManualOverride } from "./engine.js";

describe("priceComponent — Direct Payroll, single company, 150 employees, no discounts", () => {
  const component = {
    id: "comp-payroll-sub",
    shape: "BASE_PLUS_EXCESS",
    quantityDriverKey: "employees",
    poolingPolicy: "PER_ENTITY",
    vatMode: "EXCLUSIVE",
  };
  const rateCardEntry = { config: { base: 7000, includedUnits: 100, excessRate: 60 }, tiers: [], shapeOverride: null };
  const entities = [{ id: "e1", poolOrder: 0, quantities: [{ driverKey: "employees", value: 150 }] }];
  const ctx = { rateCardId: "direct", lockinYears: 1, vatRatePct: 12 };

  it("reproduces the exact live V1 numbers end to end: gross 10,000 -> net 10,000 (no rules) -> VAT 1,200 -> total 11,200", () => {
    const [line] = priceComponent({ component, rateCardEntry, entities, rateCardRules: [], ctx, chargeKind: "RECURRING" });
    expect(line.grossAmount).toBe(10000);
    expect(line.discountAmount).toBe(0);
    expect(line.netAmount).toBe(10000);
    expect(line.vatAmount).toBe(1200);
    expect(line.totalAmount).toBe(11200);
    expect(line.quantity).toBe(150);
  });
});

describe("priceComponent — HRIS with its unconditional waiver rule (zero conditions = always applies)", () => {
  const component = {
    id: "comp-hris-setup",
    shape: "FLAT",
    quantityDriverKey: null,
    poolingPolicy: "PER_ENTITY",
    vatMode: "EXCLUSIVE",
  };
  const rateCardEntry = { config: { amount: 4000 }, tiers: [] };
  const entities = [{ id: "e1", poolOrder: 0, quantities: [] }];
  const ctx = { rateCardId: "direct", vatRatePct: 12 };
  const hrisWaiver = { id: "hris-waiver", key: "hris.setup.always-waived", scope: "COMPONENT", componentId: "comp-hris-setup", rateCardId: null, effectType: "WAIVE", isActive: true, conditions: [] };

  it("is fully waived regardless of lock-in — the rule that can never again be silently absent from one code path", () => {
    const [line] = priceComponent({
      component,
      rateCardEntry,
      entities,
      rateCardRules: [hrisWaiver],
      ctx,
      chargeKind: "ONE_TIME",
    });
    expect(line.grossAmount).toBe(4000);
    expect(line.netAmount).toBe(0);
    expect(line.totalAmount).toBe(0);
    expect(line.applications[0].effectType).toBe("WAIVE");
  });
});

describe("applyScopeRules — QUOTE_TOTAL layer", () => {
  it("rolls up multiple lines and applies a whole-quote discount on top", () => {
    const lines = [
      { chargeKind: "RECURRING", netAmount: 10000 },
      { chargeKind: "RECURRING", netAmount: 4000 },
    ];
    const totalDiscountRule = { id: "r1", scope: "QUOTE_TOTAL", rateCardId: null, effectType: "PERCENT_OFF", effectValue: 10, isActive: true, conditions: [] };
    const { netAmount, discountAmount } = applyScopeRules(lines, [totalDiscountRule], { rateCardId: "direct", vatRatePct: 12 }, "RECURRING");
    expect(discountAmount).toBe(1400); // 10% of (10000+4000)
    expect(netAmount).toBe(12600);
  });
});

describe("applyManualOverride — confirmed behavior: final step, replaces the total outright, requires a reason", () => {
  it("passes the computed amount through untouched when disabled", () => {
    const { amount, overridden } = applyManualOverride(12600, { enabled: false });
    expect(amount).toBe(12600);
    expect(overridden).toBe(false);
  });

  it("replaces the computed amount outright when enabled — nothing stacks on top of it", () => {
    const { amount, overridden } = applyManualOverride(12600, { enabled: true, amount: 9500, reason: "Executive approval, verbal" });
    expect(amount).toBe(9500);
    expect(overridden).toBe(true);
  });

  it("refuses an override with no reason recorded — V1 never required one", () => {
    expect(() => applyManualOverride(12600, { enabled: true, amount: 9500 })).toThrow(/reason/i);
  });
});
