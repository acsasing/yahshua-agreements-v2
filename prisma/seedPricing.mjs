import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Seeds a real (not invented) slice of V1's Payroll pricing across three
// rate cards, to prove the SCHEMA — not just the pure evaluator functions
// already covered by lib/pricing/*.test.js — can actually hold V1's real
// definitions: Direct's base+excess rate, Globe/LMI's progressive tiers,
// and Sterling's flat per-employee rate, all on the SAME component
// definition, differentiated only by rate card (shapeOverride where the
// formula genuinely differs). Also seeds HRIS's unconditional setup
// waiver and the payroll setup fee's real per-partner lock-in thresholds
// (3 years for Globe/LMI, 2 for Sterling, never for Direct — no rule row
// at all for Direct, matching V1's `waiveLockinYears: null` exactly).

async function main() {
  // --- Quantity drivers ---
  for (const d of [
    { key: "employees", label: "Employees", unitLabel: "employee", sortOrder: 1 },
  ]) {
    await prisma.quantityDriver.upsert({ where: { key: d.key }, update: d, create: d });
  }

  // --- Components (structure only) ---
  const payrollSub = await prisma.pricingComponent.upsert({
    where: { key: "payroll.subscription" },
    update: {},
    create: { key: "payroll.subscription", name: "Payroll — Monthly Subscription" },
  });
  const payrollSetup = await prisma.pricingComponent.upsert({
    where: { key: "payroll.setup" },
    update: {},
    create: { key: "payroll.setup", name: "Payroll — One-Time Setup Fee" },
  });
  const hrisSetup = await prisma.pricingComponent.upsert({
    where: { key: "hris.setup" },
    update: {},
    create: { key: "hris.setup", name: "HRIS — One-Time Setup Fee" },
  });

  async function versionFor(component, shape, chargeKind, quantityDriverKey) {
    const existing = await prisma.pricingComponentVersion.findFirst({
      where: { componentId: component.id, version: 1 },
    });
    if (existing) return existing;
    return prisma.pricingComponentVersion.create({
      data: {
        componentId: component.id,
        version: 1,
        isPublished: true,
        shape,
        chargeKind,
        quantityDriverKey,
        poolingPolicy: "POOLED",
        vatMode: "EXCLUSIVE",
      },
    });
  }
  await versionFor(payrollSub, "BASE_PLUS_EXCESS", "RECURRING", "employees");
  await versionFor(payrollSetup, "FLAT", "ONE_TIME", null);
  await versionFor(hrisSetup, "FLAT", "ONE_TIME", null);

  // --- Rate cards: direct, partner (Globe/LMI), sterling ---
  async function rateCard(key, name, inheritsFromKey) {
    const inheritsFrom = inheritsFromKey
      ? await prisma.rateCard.findUnique({ where: { key: inheritsFromKey } })
      : null;
    return prisma.rateCard.upsert({
      where: { key },
      update: {},
      create: { key, name, inheritsFromId: inheritsFrom?.id },
    });
  }
  const direct = await rateCard("direct", "Direct");
  const partner = await rateCard("partner", "Partner Referral (Globe/LMI)");
  const sterling = await rateCard("sterling", "Sterling");

  async function rateCardVersion(card) {
    const existing = await prisma.rateCardVersion.findFirst({ where: { rateCardId: card.id, version: 1 } });
    if (existing) return existing;
    return prisma.rateCardVersion.create({ data: { rateCardId: card.id, version: 1, isPublished: true } });
  }
  const directV1 = await rateCardVersion(direct);
  const partnerV1 = await rateCardVersion(partner);
  const sterlingV1 = await rateCardVersion(sterling);

  async function entry(rcVersion, component, config, shapeOverride, tiers) {
    const existing = await prisma.rateCardEntry.findUnique({
      where: { rateCardVersionId_componentId: { rateCardVersionId: rcVersion.id, componentId: component.id } },
    });
    if (existing) return existing;
    return prisma.rateCardEntry.create({
      data: {
        rateCardVersionId: rcVersion.id,
        componentId: component.id,
        config,
        shapeOverride,
        tiers: tiers ? { create: tiers } : undefined,
      },
    });
  }

  // Direct Payroll: base+excess, matching V1's PRICING.direct.payrollStandard
  await entry(directV1, payrollSub, { base: 7000, includedUnits: 100, excessRate: 60 }, null, null);
  await entry(directV1, payrollSetup, { amount: 35000 }, null, null);

  // Globe/LMI Payroll: base + progressive tiers, matching PRICING.partner.payroll.
  // Needs its own shapeOverride: the component's canonical shape is
  // BASE_PLUS_EXCESS (Direct's formula), and Globe/LMI's formula is
  // genuinely different (progressive-tiered excess, not one flat rate) —
  // exactly the real, not hypothetical, case the shapeOverride escape
  // hatch exists for.
  await entry(partnerV1, payrollSub, { base: 5000, includedUnits: 100 }, "TIER_PROGRESSIVE", [
    { sortOrder: 0, minUnit: 101, maxUnit: 500, value: 50 },
    { sortOrder: 1, minUnit: 501, maxUnit: 1000, value: 48 },
    { sortOrder: 2, minUnit: 1001, maxUnit: 2000, value: 46 },
    { sortOrder: 3, minUnit: 2001, maxUnit: 4000, value: 43 },
    { sortOrder: 4, minUnit: 4001, maxUnit: 6000, value: 40 },
    { sortOrder: 5, minUnit: 6001, maxUnit: 8000, value: 37 },
    { sortOrder: 6, minUnit: 8001, maxUnit: 10000, value: 34 },
    { sortOrder: 7, minUnit: 10001, maxUnit: null, value: 30 },
  ]);
  await entry(partnerV1, payrollSetup, { amount: 25000 }, null, null);

  // Sterling Payroll: a genuinely different formula (flat per-employee) on
  // the SAME component — this is exactly the shapeOverride escape hatch.
  await entry(sterlingV1, payrollSub, { rate: 61.6 }, "PER_UNIT", null);
  await entry(sterlingV1, payrollSetup, { amount: 28000 }, null, null);

  // --- Rules ---
  // Prisma's upsert/findUnique shorthand rejects `null` inside a compound-
  // unique `where` (a real Prisma limitation, not a schema bug — Postgres
  // itself treats NULL as distinct-from-itself for uniqueness purposes
  // too, which is exactly why a null-scoped "applies everywhere" rule
  // needs this manual find-then-create instead of a plain upsert).
  async function upsertRule(data) {
    const existing = await prisma.pricingRule.findFirst({
      where: { key: data.key, rateCardId: data.rateCardId ?? null, version: data.version ?? 1 },
    });
    if (existing) return existing;
    return prisma.pricingRule.create({ data });
  }

  // HRIS setup: unconditional waiver, no rate-card scoping needed — it's
  // the same for every partner, matching V1's hardcoded (and, in V1,
  // inconsistently-applied) 100% waiver.
  await upsertRule({
    key: "hris.setup.always-waived",
    name: "HRIS setup fee is always waived",
    scope: "COMPONENT",
    componentId: hrisSetup.id,
    effectType: "WAIVE",
  });

  // Payroll setup lock-in waivers — per-partner thresholds, deliberately
  // scoped to Globe/LMI and Sterling ONLY, never null-scoped: a null-
  // scoped row would apply to every rate card by default (including
  // Direct), which is exactly wrong here — Direct's payroll setup fee is
  // NEVER waived by lock-in in V1 (`waiveLockinYears: null`). With no
  // null-scoped row for this key at all, `resolveRulesForRateCard`
  // correctly returns zero matching rules for Direct.
  const globeWaiver = await upsertRule({
    key: "payroll.setup.lockin-waiver",
    name: "Payroll setup fee waived at 3+ years lock-in (Globe/LMI)",
    scope: "COMPONENT",
    componentId: payrollSetup.id,
    rateCardId: partner.id,
    effectType: "WAIVE",
  });
  await prisma.pricingRuleCondition.upsert({
    where: { id: "seed-cond-globe-waiver" },
    update: {},
    create: { id: "seed-cond-globe-waiver", ruleId: globeWaiver.id, type: "LOCKIN_YEARS_AT_LEAST", intValue: 3 },
  });

  const sterlingWaiver = await upsertRule({
    key: "payroll.setup.lockin-waiver",
    name: "Sterling Payroll setup fee waived at 2+ years lock-in",
    scope: "COMPONENT",
    componentId: payrollSetup.id,
    rateCardId: sterling.id,
    effectType: "WAIVE",
  });
  await prisma.pricingRuleCondition.upsert({
    where: { id: "seed-cond-sterling-waiver" },
    update: {},
    create: { id: "seed-cond-sterling-waiver", ruleId: sterlingWaiver.id, type: "LOCKIN_YEARS_AT_LEAST", intValue: 2 },
  });

  console.log("Seeded pricing catalog: 3 quantity drivers/components, 3 rate cards (direct/partner/sterling), 3 rules.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
