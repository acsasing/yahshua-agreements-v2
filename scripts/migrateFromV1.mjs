import pg from "pg";
import { prisma } from "../lib/prisma.js";

// V1 -> V2 data migration (Phase 4). Reads directly from V1's Postgres
// database via a raw `pg` client — V1 has its own Prisma schema, not
// shared with this repo, so this is deliberately one-time, V1-schema-aware
// SQL rather than a generated client. Safe to re-run: every write here is
// an upsert keyed on a stable identity (V1's own row id, or email/key),
// never a blind insert.
//
// Scope, honestly bounded to what's actually completable against the
// engines built so far (see prisma/schema.prisma's Phase 2/3 comments):
//   1. Users             — full migration, every field.
//   2. Entities/Partners  — full migration of V1's real ISSUING_ENTITIES +
//      PARTNER_DIRECTORY (as overridden by the live PricingConfig row),
//      including rate-card creation for a partner the V2 seed doesn't
//      already know about (proves "admin added a new partner in V1"
//      migrates cleanly, not just the three built-in ones).
//   3. Agreements        — the ENVELOPE fields migrate as real columns/FKs;
//      the full `state` blob is preserved byte-for-byte inside
//      `data.v1State` rather than being re-resolved against V2's Pricing/
//      Document engines. Those engines only cover a slice of V1's real
//      product catalog so far (Payroll's two components) — re-deriving
//      `data` from `state` for every business type is real work that
//      depends on that catalog being filled out first, not a migration-
//      script concern. This is what the architecture plan's
//      "finalized agreements' snapshots migrate as frozen historical
//      records, not re-resolved" guidance already calls for, just applied
//      one step earlier than a finalize-time snapshot would.

const v1 = new pg.Client({ connectionString: process.env.V1_DATABASE_URL });

// --- 1. Users ---------------------------------------------------------

export function mapRole(v1Role) {
  if (v1Role === "TEAM") return "CONSULTANT";
  return "ADMIN"; // ADMIN and SUPER_ADMIN both collapse into V2's single Admin tier.
}

async function migrateUsers() {
  const { rows } = await v1.query(`SELECT * FROM "User"`);
  const userMap = new Map(); // v1 id -> v2 id
  const flaggedSuperAdmins = [];

  for (const u of rows) {
    const role = mapRole(u.role);
    if (u.role === "SUPER_ADMIN") flaggedSuperAdmins.push(u.email);

    const v2User = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        // Deliberately NOT overwriting role/isActive/name/passwordHash on
        // re-run — an Admin may have already adjusted these in V2 after a
        // first migration pass; only the job-function flags (which V1
        // remains the source of truth for until cutover) refresh each run.
        isSalesConsultant: u.isSalesConsultant,
        isCsmoApprover: u.isCsmoApprover,
        isCooApprover: u.isCooApprover,
        isSupervisor: u.isSupervisor,
      },
      create: {
        email: u.email,
        passwordHash: u.passwordHash, // same bcrypt format — V1 passwords keep working, unchanged.
        name: u.name,
        role,
        isActive: u.isActive,
        isSalesConsultant: u.isSalesConsultant,
        isCsmoApprover: u.isCsmoApprover,
        isCooApprover: u.isCooApprover,
        isSupervisor: u.isSupervisor,
        createdAt: u.createdAt,
      },
    });
    userMap.set(u.id, v2User.id);
  }

  if (flaggedSuperAdmins.length) {
    console.log(
      `  ⚑ ${flaggedSuperAdmins.length} V1 Super Admin(s) migrated to V2's Admin tier (V2 has no tier above Admin) — review, don't silently trust: ${flaggedSuperAdmins.join(", ")}`
    );
  }
  console.log(`  Migrated ${rows.length} users.`);
  return userMap;
}

// --- 2. Entities + Partners --------------------------------------------

// Duplicated from V1's shared/pricing.js (ABBA_INFO / ISSUING_ENTITIES /
// PARTNER_DIRECTORY / STERLING_BANK_OVERRIDE) rather than imported — this
// script lives in a different repo than V1, so there is no shared module
// to import from; these are the real, current values as of this
// migration, not invented ones.
const V1_ABBA_INFO = {
  name: "The ABBA Initiative, OPC",
  address1: "Unit #12 2F E-Max Bldg. B 71, L 5, Phase 4, Xavier Estates",
  address2: "Masterson Avenue, Upper Balulang, Cagayan de Oro City",
  address3: "Misamis Oriental, Philippines 9000",
  signatory: "Ptr. Ronnel E. Bayron",
  signatoryTitle: "Chief Executive Officer",
  contactEmail: "ronbayron@abba.works",
  bank: "Rizal Commercial Banking Corporation (RCBC)",
  bankAcct: "7-590-59122-2",
};
const V1_ISSUING_ENTITIES = {
  YOWI: {
    name: "YAHSHUA Outsourcing Worldwide, Inc.",
    shortName: "YOWI",
    signatory: "Ptr. Ronnel E. Bayron",
    signatoryTitle: "CEO/President",
    contactEmail: V1_ABBA_INFO.contactEmail,
    bank: V1_ABBA_INFO.bank,
    bankAcct: "7-590-53889-5",
  },
  TAI: {
    name: V1_ABBA_INFO.name,
    shortName: "ABBA",
    signatory: V1_ABBA_INFO.signatory,
    signatoryTitle: V1_ABBA_INFO.signatoryTitle,
    contactEmail: V1_ABBA_INFO.contactEmail,
    bank: V1_ABBA_INFO.bank,
    bankAcct: V1_ABBA_INFO.bankAcct,
  },
};
// V1 has no per-partner entity override column — Sterling's paperwork is
// issued as TAI (same name/address/signatory) but deposits into a
// different bank account entirely (shared/pricing.js's
// STERLING_BANK_OVERRIDE). V2's Partner->Entity link is one real Entity
// per partner with no partial-override mechanism, so that V1 behavior
// becomes its own Entity row here — same legal identity as TAI, different
// bank details — rather than adding a schema column for a single case.
const V1_STERLING_BANK_OVERRIDE = { bank: "Sterling Bank of Asia", bankAcct: "58100261658" };
const V1_DEFAULT_PARTNER_DIRECTORY = [
  { name: "Globe", rateKey: "partner" },
  { name: "LMI", rateKey: "partner" },
  { name: "Sterling", rateKey: "sterling" },
];

export function slugify(name) {
  return (name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "partner";
}

async function upsertEntity(id, name, def, overrides = {}) {
  return prisma.entity.upsert({
    where: { id },
    update: {
      name,
      shortName: def.shortName,
      address1: V1_ABBA_INFO.address1,
      address2: V1_ABBA_INFO.address2,
      address3: V1_ABBA_INFO.address3,
      signatoryName: def.signatory,
      signatoryTitle: def.signatoryTitle,
      contactEmail: def.contactEmail,
      bankName: overrides.bank ?? def.bank,
      bankAccountNo: overrides.bankAcct ?? def.bankAcct,
    },
    create: {
      id,
      name,
      shortName: def.shortName,
      address1: V1_ABBA_INFO.address1,
      address2: V1_ABBA_INFO.address2,
      address3: V1_ABBA_INFO.address3,
      signatoryName: def.signatory,
      signatoryTitle: def.signatoryTitle,
      contactEmail: def.contactEmail,
      bankName: overrides.bank ?? def.bank,
      bankAccountNo: overrides.bankAcct ?? def.bankAcct,
    },
  });
}

// Prisma's upsert shorthand rejects `null` inside a compound-unique
// `where` (the same real limitation seedPricing.mjs's upsertRule() and
// seedDocuments.mjs work around) — findFirst + conditional create instead.
async function findOrCreateRateCardVersion(rateCardId) {
  let version = await prisma.rateCardVersion.findFirst({ where: { rateCardId, version: 1 } });
  if (!version) {
    version = await prisma.rateCardVersion.create({ data: { rateCardId, version: 1, isPublished: true } });
  }
  return version;
}

async function findOrCreateRateCardEntry(rateCardVersionId, componentId, config, shapeOverride, tiers) {
  let entry = await prisma.rateCardEntry.findUnique({
    where: { rateCardVersionId_componentId: { rateCardVersionId, componentId } },
  });
  if (entry) return entry;
  return prisma.rateCardEntry.create({
    data: { rateCardVersionId, componentId, config, shapeOverride, tiers: tiers ? { create: tiers } : undefined },
  });
}

// A payroll rate profile from V1's PricingConfig.rates[rateKey].payroll can
// be either flat-per-employee (Sterling's shape: {setupFee, perEmployee,
// waiveLockinYears}) or base+excess/base+progressive-tiers (Direct/
// Globe-LMI's shape: {base, included, setupFee, excessRate?, excessTiers?}).
// Only these two real shapes appear in V1's actual data (verified against
// the live PricingConfig row, not assumed) — a rate-card key whose payroll
// profile matches neither is skipped with a warning rather than guessed at.
async function seedPayrollRateCardEntries(rateCardVersionId, payrollSubId, payrollSetupId, profile) {
  if (!profile) return; // e.g. V1's own "hris: null" convention for a rate key with no payroll product at all.

  if (profile.perEmployee != null) {
    await findOrCreateRateCardEntry(rateCardVersionId, payrollSubId, { rate: profile.perEmployee }, "PER_UNIT", null);
  } else if (profile.excessTiers) {
    const tiers = profile.excessTiers.map(([min, max, value], sortOrder) => ({
      sortOrder,
      minUnit: min,
      maxUnit: max === null ? null : max,
      value,
    }));
    await findOrCreateRateCardEntry(
      rateCardVersionId,
      payrollSubId,
      { base: profile.base, includedUnits: profile.included },
      "TIER_PROGRESSIVE",
      tiers
    );
  } else if (profile.base != null && profile.excessRate != null) {
    await findOrCreateRateCardEntry(
      rateCardVersionId,
      payrollSubId,
      { base: profile.base, includedUnits: profile.included, excessRate: profile.excessRate },
      null,
      null
    );
  } else {
    console.log(`    ⚠ unrecognized payroll profile shape for this rate card — skipped: ${JSON.stringify(profile)}`);
    return;
  }

  if (profile.setupFee != null) {
    await findOrCreateRateCardEntry(rateCardVersionId, payrollSetupId, { amount: profile.setupFee }, null, null);
  }
}

async function migrateEntitiesAndPartners() {
  const tai = await upsertEntity("seed-entity-tai", V1_ABBA_INFO.name, V1_ISSUING_ENTITIES.TAI);
  const yowi = await upsertEntity("seed-entity-yowi", V1_ISSUING_ENTITIES.YOWI.name, V1_ISSUING_ENTITIES.YOWI);
  const sterlingEntity = await upsertEntity(
    "seed-entity-tai-sterling-remit",
    `${V1_ABBA_INFO.name} (Sterling Remittance)`,
    V1_ISSUING_ENTITIES.TAI,
    V1_STERLING_BANK_OVERRIDE
  );

  // The live PricingConfig row's `partners` column overrides the hardcoded
  // PARTNER_DIRECTORY wholesale, exactly like V1's own applyPartnerDirectory()
  // — an admin who's added a partner in Back Office has already made this
  // the real directory, not the code defaults.
  const { rows: pcRows } = await v1.query(`SELECT rates, partners FROM "PricingConfig" WHERE id = 'singleton'`);
  const pricingConfig = pcRows[0];
  const directory =
    Array.isArray(pricingConfig?.partners) && pricingConfig.partners.length
      ? pricingConfig.partners
      : V1_DEFAULT_PARTNER_DIRECTORY;
  const rates = pricingConfig?.rates || {};

  const payrollSub = await prisma.pricingComponent.findUnique({ where: { key: "payroll.subscription" } });
  const payrollSetup = await prisma.pricingComponent.findUnique({ where: { key: "payroll.setup" } });

  const partnerByName = new Map();
  const entityByKey = { YOWI: yowi, TAI: tai };

  for (const p of directory) {
    const entity = p.name === "Sterling" ? sterlingEntity : p.name === "Globe" || p.name === "LMI" ? yowi : tai;

    let rateCard = await prisma.rateCard.findUnique({ where: { key: p.rateKey } });
    if (!rateCard) {
      // A rate key the Phase 2 seed doesn't already know (e.g. an admin-
      // added partner like "PBCOM Test") — build its rate card from the
      // real PricingConfig data, scoped to Payroll only (the one product
      // line the Pricing Engine currently models end-to-end; see the
      // module comment above).
      rateCard = await prisma.rateCard.create({ data: { key: p.rateKey, name: p.name } });
      const version = await findOrCreateRateCardVersion(rateCard.id);
      if (payrollSub && payrollSetup) {
        await seedPayrollRateCardEntries(version.id, payrollSub.id, payrollSetup.id, rates[p.rateKey]?.payroll);
      }
      console.log(`  Created new rate card "${p.rateKey}" for partner "${p.name}" (not one of Phase 2's seeded defaults).`);
    }

    const partner = await prisma.partner.upsert({
      where: { name: p.name },
      update: { entityId: entity.id, defaultRateCardId: rateCard.id },
      create: { name: p.name, slug: slugify(p.name), entityId: entity.id, defaultRateCardId: rateCard.id },
    });
    partnerByName.set(p.name, partner);
  }

  console.log(`  Migrated 3 entities (TAI, YOWI, Sterling-remittance variant), ${directory.length} partners.`);
  return { entityByKey, partnerByName };
}

// --- 3. Agreements -------------------------------------------------------

async function migrateAgreements(userMap, entityByKey, partnerByName) {
  const { rows } = await v1.query(`SELECT * FROM "Agreement"`);
  let migrated = 0;
  let skipped = 0;

  for (const a of rows) {
    const createdById = userMap.get(a.createdById);
    if (!createdById) {
      console.log(`  ⚠ skipped agreement ${a.id} (${a.companyName}) — its V1 creator didn't migrate.`);
      skipped++;
      continue;
    }

    const partner = a.engagement === "PARTNER" && a.partner ? partnerByName.get(a.partner) : null;
    const issuingEntityKey = a.state?.issuingEntity;
    const entity = issuingEntityKey ? entityByKey[issuingEntityKey] : null;

    await prisma.agreement.upsert({
      where: { id: a.id },
      update: {}, // idempotent: a re-run never overwrites an already-migrated agreement.
      create: {
        id: a.id, // reusing V1's own id verbatim — cheap traceability, no collision risk (different DB).
        status: a.status,
        companyName: a.companyName,
        partnerId: partner?.id ?? null,
        entityId: entity?.id ?? null,
        createdById,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        finalizedAt: a.finalizedAt,
        deletedAt: a.deletedAt,
        data: {
          migratedFromV1: true,
          v1Id: a.id,
          // The full original blob, preserved byte-for-byte rather than
          // re-resolved against V2's still-partial Pricing/Document
          // engines — same principle the architecture plan already
          // applies to a finalized agreement's pricing/template snapshot,
          // just carried one step earlier (see module comment above).
          v1State: a.state,
          v1Meta: {
            engagement: a.engagement,
            partnerName: a.partner,
            solutions: a.solutions,
            tags: a.tags,
            isRenewal: a.isRenewal,
            pdfUrl: a.pdfUrl,
            pdfUploadedAt: a.pdfUploadedAt,
            finalizedById: a.finalizedById ? (userMap.get(a.finalizedById) ?? null) : null,
            deletedById: a.deletedById ? (userMap.get(a.deletedById) ?? null) : null,
            salesConsultantId: a.salesConsultantId ? (userMap.get(a.salesConsultantId) ?? null) : null,
          },
        },
      },
    });
    migrated++;
  }

  console.log(`  Migrated ${migrated} agreements${skipped ? ` (${skipped} skipped — see warnings above)` : ""}.`);
}

async function main() {
  if (!process.env.V1_DATABASE_URL) {
    throw new Error("V1_DATABASE_URL is not set — point it at V1's Postgres database before running this script.");
  }
  await v1.connect();
  try {
    console.log("1. Users");
    const userMap = await migrateUsers();
    console.log("2. Entities + Partners");
    const { entityByKey, partnerByName } = await migrateEntitiesAndPartners();
    console.log("3. Agreements");
    await migrateAgreements(userMap, entityByKey, partnerByName);
    console.log("Done.");
  } finally {
    await v1.end();
    await prisma.$disconnect();
  }
}

// Only run when executed directly (`node scripts/migrateFromV1.mjs` /
// `npm run migrate:from-v1`) — never on import, so migrateFromV1.test.js
// can import this module's pure helpers (mapRole, slugify) without
// triggering a real V1 database connection.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
