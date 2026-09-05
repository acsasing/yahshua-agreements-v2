import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../prisma.js";
import { priceComponent } from "./engine.js";

// A real, DB-backed integration test — loads the ACTUAL seeded rows
// (prisma/seedPricing.mjs) rather than in-memory fixtures, so it also
// exercises the schema itself: the rate-card inheritance/override
// mechanism, the shapeOverride escape hatch (Sterling's flat rate on the
// same component Globe uses a progressive-tiered rate for), and the
// rate-card-scoped rule resolution (resolveRulesForRateCard) against real
// rows, not hand-built fixtures.

let payrollSubResolved, payrollSetupResolved, direct, partner, sterling, allRules;

beforeAll(async () => {
  const payrollSub = await prisma.pricingComponent.findUniqueOrThrow({
    where: { key: "payroll.subscription" },
    include: { versions: { where: { version: 1 } } },
  });
  const payrollSetup = await prisma.pricingComponent.findUniqueOrThrow({
    where: { key: "payroll.setup" },
    include: { versions: { where: { version: 1 } } },
  });
  // priceComponent()'s `component.id` must be the PricingComponent's OWN
  // id (that's what PricingRule.componentId references) — merging it with
  // the version's fields here, rather than passing `versions[0]` alone,
  // is exactly the fix for a real bug this test caught on its first run
  // (the rule lookup silently matched nothing because it was comparing
  // against the version's id instead). Spread the version FIRST, then
  // override `id` — the version object has its own `id` field too, and
  // object-spread lets whichever comes later in the literal win, so
  // `{ id: payrollSub.id, ...version }` would silently undo the very fix
  // this comment describes (a real bug this test also caught, on its
  // second run).
  payrollSubResolved = { ...payrollSub.versions[0], id: payrollSub.id };
  payrollSetupResolved = { ...payrollSetup.versions[0], id: payrollSetup.id };

  direct = await prisma.rateCard.findUniqueOrThrow({ where: { key: "direct" } });
  partner = await prisma.rateCard.findUniqueOrThrow({ where: { key: "partner" } });
  sterling = await prisma.rateCard.findUniqueOrThrow({ where: { key: "sterling" } });
  allRules = await prisma.pricingRule.findMany({ include: { conditions: true } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function entryFor(rateCard, componentId) {
  const version = await prisma.rateCardVersion.findFirstOrThrow({ where: { rateCardId: rateCard.id, version: 1 } });
  return prisma.rateCardEntry.findUniqueOrThrow({
    where: { rateCardVersionId_componentId: { rateCardVersionId: version.id, componentId } },
    include: { tiers: true },
  });
}

describe("Direct Payroll — 150 employees, 1-year lock-in", () => {
  it("subscription: base+excess = PHP 10,000/mo net (real seeded rate-card data, not a fixture)", async () => {
    const entry = await entryFor(direct, payrollSubResolved.id);
    const entities = [{ id: "e1", poolOrder: 0, quantities: [{ driverKey: "employees", value: 150 }] }];
    const ctx = { rateCardId: direct.id, lockinYears: 1, vatRatePct: 12 };
    const [line] = priceComponent({
      component: payrollSubResolved,
      rateCardEntry: entry,
      entities,
      rateCardRules: allRules,
      ctx,
      chargeKind: "RECURRING",
    });
    expect(line.netAmount).toBe(10000);
  });

  it("setup fee: NEVER waived, even at a 5-year lock-in — no rule exists for Direct on this key at all", async () => {
    const entry = await entryFor(direct, payrollSetupResolved.id);
    const entities = [{ id: "e1", poolOrder: 0, quantities: [] }];
    const ctx = { rateCardId: direct.id, lockinYears: 5, vatRatePct: 12 };
    const [line] = priceComponent({
      component: payrollSetupResolved,
      rateCardEntry: entry,
      entities,
      rateCardRules: allRules,
      ctx,
      chargeKind: "ONE_TIME",
    });
    expect(line.netAmount).toBe(35000); // full fee, untouched
    expect(line.applications).toEqual([]);
  });
});

describe("Globe/LMI Payroll — 600 employees", () => {
  it("subscription: progressive tiers from the seeded RateTier rows = PHP 29,800/mo (same value the pure-function test already proved, now sourced from real DB rows)", async () => {
    const entry = await entryFor(partner, payrollSubResolved.id);
    expect(entry.shapeOverride).toBe("TIER_PROGRESSIVE"); // confirms the override actually persisted
    const entities = [{ id: "e1", poolOrder: 0, quantities: [{ driverKey: "employees", value: 600 }] }];
    const ctx = { rateCardId: partner.id, lockinYears: 3, vatRatePct: 12 };
    const [line] = priceComponent({
      component: payrollSubResolved,
      rateCardEntry: entry,
      entities,
      rateCardRules: allRules,
      ctx,
      chargeKind: "RECURRING",
    });
    expect(line.netAmount).toBe(29800);
  });

  it("setup fee: waived at 3-year lock-in (Globe's real threshold), full fee below it", async () => {
    const entry = await entryFor(partner, payrollSetupResolved.id);
    const entities = [{ id: "e1", poolOrder: 0, quantities: [] }];
    const metThreshold = { rateCardId: partner.id, lockinYears: 3, vatRatePct: 12 };
    const belowThreshold = { rateCardId: partner.id, lockinYears: 2, vatRatePct: 12 };

    const [waived] = priceComponent({
      component: payrollSetupResolved, rateCardEntry: entry, entities, rateCardRules: allRules, ctx: metThreshold, chargeKind: "ONE_TIME",
    });
    const [notWaived] = priceComponent({
      component: payrollSetupResolved, rateCardEntry: entry, entities, rateCardRules: allRules, ctx: belowThreshold, chargeKind: "ONE_TIME",
    });
    expect(waived.netAmount).toBe(0);
    expect(notWaived.netAmount).toBe(25000); // full Globe/LMI setup fee, un-waived below threshold
  });
});

describe("Sterling Payroll — the shapeOverride escape hatch", () => {
  it("100 employees: PER_UNIT override (61.6/employee) on the SAME component Globe uses TIER_PROGRESSIVE for = PHP 6,160/mo", async () => {
    const entry = await entryFor(sterling, payrollSubResolved.id);
    expect(entry.shapeOverride).toBe("PER_UNIT"); // confirms the override actually persisted correctly
    const entities = [{ id: "e1", poolOrder: 0, quantities: [{ driverKey: "employees", value: 100 }] }];
    const ctx = { rateCardId: sterling.id, lockinYears: 2, vatRatePct: 12 };
    const [line] = priceComponent({
      component: payrollSubResolved,
      rateCardEntry: entry,
      entities,
      rateCardRules: allRules,
      ctx,
      chargeKind: "RECURRING",
    });
    expect(line.netAmount).toBeCloseTo(6160, 5);
  });

  it("setup fee: waived at Sterling's own 2-year threshold, distinct from Globe's 3-year threshold on the same key", async () => {
    const entry = await entryFor(sterling, payrollSetupResolved.id);
    const entities = [{ id: "e1", poolOrder: 0, quantities: [] }];
    const ctx = { rateCardId: sterling.id, lockinYears: 2, vatRatePct: 12 };
    const [line] = priceComponent({
      component: payrollSetupResolved, rateCardEntry: entry, entities, rateCardRules: allRules, ctx, chargeKind: "ONE_TIME",
    });
    expect(line.netAmount).toBe(0);
  });
});
