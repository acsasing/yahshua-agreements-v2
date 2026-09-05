import { describe, it, expect } from "vitest";
import { evaluateShape } from "./shapes.js";

// Parity tests against V1's REAL numbers (shared/pricing.js in
// acsasing/yahshua-agreements) — not invented examples. Each case names
// exactly which V1 rate/product it reproduces, so a future engine change
// that breaks one of these is a real regression, not a false alarm.

describe("BASE_PLUS_EXCESS — Direct Payroll standard rate", () => {
  // V1: PRICING.direct.payrollStandard = { base: 7000, included: 100, excessRate: 60 }
  const config = { base: 7000, includedUnits: 100, excessRate: 60 };

  it("150 employees -> PHP 10,000/mo (matches the live V1 Direct Renewal screenshot verified earlier: 7000 base + 50 excess x 60)", () => {
    const { amount, breakdown } = evaluateShape({
      shape: "BASE_PLUS_EXCESS",
      config,
      interval: { start: 1, end: 150 },
    });
    expect(amount).toBe(10000);
    expect(breakdown.baseFee).toBe(7000);
    expect(breakdown.excess).toBe(50);
  });

  it("100 employees exactly -> just the base fee, no excess", () => {
    const { amount } = evaluateShape({ shape: "BASE_PLUS_EXCESS", config, interval: { start: 1, end: 100 } });
    expect(amount).toBe(7000);
  });

  it("pooled group: base fee only charges the entity holding position 1, not every entity", () => {
    // Company A: 80 employees (positions 1-80). Company B: 40 employees (positions 81-120).
    const companyA = evaluateShape({ shape: "BASE_PLUS_EXCESS", config, interval: { start: 1, end: 80 } });
    const companyB = evaluateShape({ shape: "BASE_PLUS_EXCESS", config, interval: { start: 81, end: 120 } });
    expect(companyA.amount).toBe(7000); // base only, no excess (80 < 100 included)
    expect(companyB.breakdown.baseFee).toBe(0); // NOT charged again
    expect(companyB.amount).toBe(20 * 60); // positions 101-120 = 20 units of excess at 60
  });
});

describe("PER_UNIT — Sterling Payroll", () => {
  // V1: PRICING.sterling.payroll = { perEmployee: 61.6 }
  it("100 employees -> PHP 6,160.00", () => {
    const { amount } = evaluateShape({
      shape: "PER_UNIT",
      config: { rate: 61.6 },
      interval: { start: 1, end: 100 },
    });
    expect(amount).toBeCloseTo(6160, 5);
  });
});

describe("TIER_PROGRESSIVE — Globe/LMI Payroll (marginal, tax-bracket-style)", () => {
  // V1: PRICING.partner.payroll = { base: 5000, included: 100,
  //   excessTiers: [[101,500,50],[501,1000,48],[1001,2000,46],[2001,4000,43],
  //                 [4001,6000,40],[6001,8000,37],[8001,10000,34],[10001,Infinity,30]] }
  const config = { base: 5000, includedUnits: 100 };
  const tiers = [
    { sortOrder: 0, minUnit: 101, maxUnit: 500, value: 50 },
    { sortOrder: 1, minUnit: 501, maxUnit: 1000, value: 48 },
    { sortOrder: 2, minUnit: 1001, maxUnit: 2000, value: 46 },
    { sortOrder: 3, minUnit: 2001, maxUnit: 4000, value: 43 },
    { sortOrder: 4, minUnit: 4001, maxUnit: 6000, value: 40 },
    { sortOrder: 5, minUnit: 6001, maxUnit: 8000, value: 37 },
    { sortOrder: 6, minUnit: 8001, maxUnit: 10000, value: 34 },
    { sortOrder: 7, minUnit: 10001, maxUnit: null, value: 30 },
  ];

  it("600 employees splits across two brackets: 5000 base + 400@50 + 100@48 = PHP 29,800", () => {
    const { amount, breakdown } = evaluateShape({
      shape: "TIER_PROGRESSIVE",
      config,
      tiers,
      interval: { start: 1, end: 600 },
    });
    expect(amount).toBe(29800);
    expect(breakdown.tierBreakdown).toEqual([
      { min: 101, max: 500, count: 400, rate: 50 },
      { min: 501, max: 600, count: 100, rate: 48 },
    ]);
  });

  it("open-ended top bracket (maxUnit: null, never Infinity) still resolves correctly at 12,000 employees", () => {
    const { amount } = evaluateShape({
      shape: "TIER_PROGRESSIVE",
      config,
      tiers,
      interval: { start: 1, end: 12000 },
    });
    // base 5000 + (500-101+1=400)*50 + (1000-501+1=500)*48 + (2000-1001+1=1000)*46
    // + (4000-2001+1=2000)*43 + (6000-4001+1=2000)*40 + (8000-6001+1=2000)*37
    // + (10000-8001+1=2000)*34 + (12000-10001+1=2000)*30
    const expected =
      5000 + 400 * 50 + 500 * 48 + 1000 * 46 + 2000 * 43 + 2000 * 40 + 2000 * 37 + 2000 * 34 + 2000 * 30;
    expect(amount).toBe(expected);
  });
});

describe("TIER_LOOKUP — Facial Recognition (cliff, double-tiered)", () => {
  // V1: PRICING.facialRecognition = {
  //   baseTiers: [[1,50,350],[51,100,700]], includedEmployees: 100,
  //   excessTiers: [[101,1000,6],[1001,3000,5],[3001,5000,4],[5001,Infinity,3]] }
  const baseTiers = [
    { sortOrder: 0, minUnit: 1, maxUnit: 50, value: 350 },
    { sortOrder: 1, minUnit: 51, maxUnit: 100, value: 700 },
  ];
  const excessTiers = [
    { sortOrder: 0, minUnit: 101, maxUnit: 1000, value: 6 },
    { sortOrder: 1, minUnit: 1001, maxUnit: 3000, value: 5 },
    { sortOrder: 2, minUnit: 3001, maxUnit: 5000, value: 4 },
    { sortOrder: 3, minUnit: 5001, maxUnit: null, value: 3 },
  ];

  it("150 employees: base clamped to the 51-100 bracket (700) + 50 excess x PHP 6 = PHP 1,000 total", () => {
    const base = evaluateShape({
      shape: "TIER_LOOKUP",
      config: { lookupBasis: "TOTAL", billingBasis: "TOTAL", includedUnits: 100, tierValueKind: "FLAT_AMOUNT", clampLookupToIncluded: true },
      tiers: baseTiers,
      interval: { start: 1, end: 150 },
    });
    const excess = evaluateShape({
      shape: "TIER_LOOKUP",
      config: { lookupBasis: "TOTAL", billingBasis: "EXCESS", includedUnits: 100, tierValueKind: "PER_UNIT_RATE" },
      tiers: excessTiers,
      interval: { start: 1, end: 150 },
    });
    expect(base.amount).toBe(700); // clamped lookup(150->100) selects the 51-100 bracket
    expect(excess.amount).toBe(300); // total=150 selects the 101-1000 bracket (rate 6), billed x 50 excess
    expect(base.amount + excess.amount).toBe(1000);
  });

  it("30 employees: no clamping needed, base picks the 1-50 bracket, no excess at all", () => {
    const base = evaluateShape({
      shape: "TIER_LOOKUP",
      config: { lookupBasis: "TOTAL", billingBasis: "TOTAL", includedUnits: 100, tierValueKind: "FLAT_AMOUNT", clampLookupToIncluded: true },
      tiers: baseTiers,
      interval: { start: 1, end: 30 },
    });
    expect(base.amount).toBe(350);
  });
});

describe("FLAT — HRIS", () => {
  // V1: PRICING.direct.hris = { flat: 4000 }
  it("always PHP 4,000/mo regardless of headcount", () => {
    const { amount } = evaluateShape({ shape: "FLAT", config: { amount: 4000 }, interval: { start: 1, end: 9999 } });
    expect(amount).toBe(4000);
  });
});

describe("MULTI_FACTOR — Face-to-Face Visit proposal", () => {
  // V1: dailyRate x personnel x (trainingDays + travelDays), no operators/parser —
  // just a closed factorGroups grammar (grouped keys are summed, groups are multiplied).
  it("PHP 20,000/day x 5 personnel x (2 training + 1 travel day) = PHP 300,000", () => {
    const { amount, breakdown } = evaluateShape({
      shape: "MULTI_FACTOR",
      config: { rate: 20000, factorGroups: [["personnel"], ["trainingDays", "travelDays"]] },
      quantities: { personnel: 5, trainingDays: 2, travelDays: 1 },
    });
    expect(amount).toBe(300000);
    expect(breakdown.groupSums).toEqual([
      { keys: ["personnel"], sum: 5 },
      { keys: ["trainingDays", "travelDays"], sum: 3 },
    ]);
  });
});
