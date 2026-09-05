import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Seeds a real (not invented) slice of V1's Subscription agreement through
// the Document Templating Engine: the "IV. Fees and Terms of Payment"
// section carrying the exact Setup Period / Billing Commencement clause
// shipped this session in V1's shared/legalText.js (PR #15), gated behind
// a conditionalBlock on the same `SETUP_ENABLED` condition V1 computes as
// `hasSetupSection` in JS — proving the schema can actually hold a real
// V1 document, not just a toy paragraph.

async function main() {
  // DocumentTemplate is scoped to an Offering (Phase 2 never needed to
  // seed one — Offering bundles pricing products, not documents — so it's
  // created here, matching V1's "subscription" business type).
  const offering = await prisma.offering.upsert({
    where: { key: "subscription" },
    update: {},
    create: { key: "subscription", name: "Subscription Agreement", allowsGroup: true },
  });

  // null partnerId = the default every partner uses unless it has its own
  // override row (the same resolution V1's AgreementTemplateSection uses
  // for documentKey + partner). Prisma's upsert shorthand rejects `null`
  // inside a compound-unique `where` (the same real limitation
  // seedPricing.mjs's upsertRule() works around) — findFirst + conditional
  // create instead.
  let template = await prisma.documentTemplate.findFirst({ where: { offeringId: offering.id, partnerId: null } });
  if (!template) {
    template = await prisma.documentTemplate.create({
      data: { offeringId: offering.id, partnerId: null, name: "Subscription Agreement — Default" },
    });
  }

  let version = await prisma.documentTemplateVersion.findFirst({ where: { templateId: template.id, version: 1 } });
  if (!version) {
    version = await prisma.documentTemplateVersion.create({
      data: { templateId: template.id, version: 1, isPublished: true, publishedAt: new Date() },
    });
    await prisma.documentTemplate.update({ where: { id: template.id }, data: { currentVersionId: version.id } });
  }

  const feesAndPaymentContent = {
    type: "doc",
    content: [
      {
        type: "conditionalBlock",
        attrs: { conditions: [{ type: "SETUP_ENABLED", boolValue: true }] },
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text:
                  'The CLIENT shall be entitled to a setup period of fourteen (14) calendar days (the "Setup Period"). ' +
                  "The Setup Period shall commence on the date the setup process is formally commenced with the CLIENT " +
                  '(the "Setup Commencement Date"), which date shall be documented in the Setup Period and Billing ' +
                  "Commencement Acknowledgment to be issued following commencement of setup.",
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text:
                  "Subscription fees shall commence on the calendar day immediately following the expiration of the Setup " +
                  'Period (the "Billing Commencement Date"), regardless of whether all setup activities have been ' +
                  "completed by such date, except where the delay in setup is solely and directly attributable to ",
              },
              { type: "mergeTag", attrs: { tag: "entity.shortName" } },
              { type: "text", text: "." },
            ],
          },
        ],
      },
    ],
  };

  await prisma.documentTemplateSection.upsert({
    where: { documentTemplateVersionId_sectionKey: { documentTemplateVersionId: version.id, sectionKey: "feesAndPayment" } },
    update: { content: feesAndPaymentContent },
    create: {
      documentTemplateVersionId: version.id,
      sortOrder: 1,
      sectionKey: "feesAndPayment",
      title: "IV. Fees and Terms of Payment",
      kind: "BODY",
      content: feesAndPaymentContent,
    },
  });

  console.log("Seeded Document Templating Engine: 1 offering, 1 default template, 1 published version, 1 section.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
