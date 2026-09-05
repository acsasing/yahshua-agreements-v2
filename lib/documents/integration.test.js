import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../prisma.js";
import { renderDocument } from "./render.js";

// A real, DB-backed integration test — loads the ACTUAL seeded template
// (prisma/seedDocuments.mjs) rather than an in-memory fixture, so it also
// exercises the schema itself: DocumentTemplate → DocumentTemplateVersion
// → DocumentTemplateSection resolution (offeringId + null partnerId =
// the default template every partner uses absent its own override row),
// and that the persisted `content` Json round-trips through Postgres
// still shaped the way renderNode expects.

let sections;

beforeAll(async () => {
  const offering = await prisma.offering.findUniqueOrThrow({ where: { key: "subscription" } });
  const template = await prisma.documentTemplate.findFirstOrThrow({
    where: { offeringId: offering.id, partnerId: null },
  });
  const version = await prisma.documentTemplateVersion.findFirstOrThrow({
    where: { templateId: template.id, version: 1 },
    include: { sections: true },
  });
  sections = version.sections;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Subscription Agreement — default template, real seeded row", () => {
  it("holds exactly the seeded 'feesAndPayment' section, published", async () => {
    expect(sections).toHaveLength(1);
    expect(sections[0].sectionKey).toBe("feesAndPayment");
  });

  it("renders the real Setup Period / Billing Commencement clause verbatim when setup is enabled, merge tag resolved from a real Entity row", async () => {
    const entity = await prisma.entity.findFirstOrThrow();
    const html = renderDocument(sections, {
      data: { entity: { shortName: entity.shortName } },
      conditionCtx: { setupEnabled: true },
    });
    expect(html).toContain('<section data-section-key="feesAndPayment"><h2>IV. Fees and Terms of Payment</h2>');
    expect(html).toContain('The CLIENT shall be entitled to a setup period of fourteen (14) calendar days (the "Setup Period").');
    expect(html).toContain(`solely and directly attributable to ${entity.shortName}.`);
  });

  it("renders the clause's content as empty when setup is disabled, matching V1's `hasSetupSection ? ... : \`\`` fallback — the section wrapper itself still renders", async () => {
    const html = renderDocument(sections, { data: {}, conditionCtx: { setupEnabled: false } });
    expect(html).toBe('<section data-section-key="feesAndPayment"><h2>IV. Fees and Terms of Payment</h2></section>');
  });
});
