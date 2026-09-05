import { describe, it, expect } from "vitest";
import { renderNode, renderDocument } from "./render.js";

describe("renderNode — basic node types", () => {
  it("paragraph + text", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello." }] }] };
    expect(renderNode(doc, {})).toBe("<p>Hello.</p>");
  });

  it("marks: bold/italic/underline compose in order", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "bold" }, { type: "italic" }] }] }],
    };
    expect(renderNode(doc, {})).toBe("<p><em><strong>x</strong></em></p>");
  });

  it("bulletList/listItem", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] },
          ],
        },
      ],
    };
    expect(renderNode(doc, {})).toBe("<ul><li><p>one</p></li><li><p>two</p></li></ul>");
  });

  it("text content escapes & < > but leaves quotes/apostrophes literal (matches V1's raw HTML)", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `the "Setup Period" & CLIENT's obligations < > ` }] }] };
    expect(renderNode(doc, {})).toBe(`<p>the "Setup Period" &amp; CLIENT's obligations &lt; &gt; </p>`);
  });
});

describe("mergeTag", () => {
  it("resolves a dot-path from ctx.data", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "attributable to " }, { type: "mergeTag", attrs: { tag: "entity.shortName" } }, { type: "text", text: "." }] }] };
    expect(renderNode(doc, { data: { entity: { shortName: "ABBA" } } })).toBe("<p>attributable to ABBA.</p>");
  });

  it("an unresolved/unknown tag renders empty rather than throwing — a mid-draft template still previews", () => {
    const doc = { type: "doc", content: [{ type: "mergeTag", attrs: { tag: "nope.notThere" } }] };
    expect(() => renderNode(doc, { data: {} })).not.toThrow();
    expect(renderNode(doc, { data: {} })).toBe("");
    expect(renderNode(doc, {})).toBe("");
  });
});

describe("conditionalBlock — reuses the Pricing Engine's exact evaluateConditions grammar", () => {
  const setupEnabledBlock = {
    type: "conditionalBlock",
    attrs: { conditions: [{ type: "SETUP_ENABLED", boolValue: true }] },
    content: [{ type: "paragraph", content: [{ type: "text", text: "Setup Period text." }] }],
  };

  it("renders its content when the condition is true", () => {
    expect(renderNode(setupEnabledBlock, { conditionCtx: { setupEnabled: true } })).toBe("<p>Setup Period text.</p>");
  });

  it("renders nothing when the condition is false — matching V1's `hasSetupSection ? ... : \`\`` SLOT pattern", () => {
    expect(renderNode(setupEnabledBlock, { conditionCtx: { setupEnabled: false } })).toBe("");
    expect(renderNode(setupEnabledBlock, {})).toBe("");
  });
});

describe("computedTable", () => {
  it("is filled from ctx.computedTables by tableKey, never resolved here", () => {
    const doc = { type: "doc", content: [{ type: "computedTable", attrs: { tableKey: "annexA.pricing" } }] };
    const html = "<table><tr><td>Payroll</td><td>PHP 10,000/mo</td></tr></table>";
    expect(renderNode(doc, { computedTables: { "annexA.pricing": html } })).toBe(html);
  });

  it("an unknown tableKey renders empty, not a crash", () => {
    const doc = { type: "doc", content: [{ type: "computedTable", attrs: { tableKey: "missing" } }] };
    expect(renderNode(doc, { computedTables: {} })).toBe("");
  });
});

// Golden-value parity: the EXACT real text this session already shipped
// in V1's shared/legalText.js (PR #15, Section IV's `setupFeeIntro` SLOT),
// re-expressed as an admin-authored ProseMirror tree — one conditionalBlock
// gated on the same `hasSetupSection` condition V1 computes in JS, one
// mergeTag standing in for V1's `${entity.shortName}` interpolation — and
// proven to render back out to V1's real shipped sentences, not invented
// placeholder text.
describe("golden value: V1's Section IV Setup Period / Billing Commencement clause", () => {
  const setupFeeIntro = {
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
              'The Setup Period shall commence on the date the setup process is formally commenced with the CLIENT ' +
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
  };

  const ctx = { data: { entity: { shortName: "ABBA" } }, conditionCtx: { setupEnabled: true } };

  it("renders both paragraphs verbatim, with the merge tag resolved, when setup is enabled", () => {
    const html = renderNode(setupFeeIntro, ctx);
    expect(html).toBe(
      '<p>The CLIENT shall be entitled to a setup period of fourteen (14) calendar days (the "Setup Period"). ' +
        "The Setup Period shall commence on the date the setup process is formally commenced with the CLIENT " +
        '(the "Setup Commencement Date"), which date shall be documented in the Setup Period and Billing ' +
        "Commencement Acknowledgment to be issued following commencement of setup.</p>" +
        "<p>Subscription fees shall commence on the calendar day immediately following the expiration of the Setup " +
        'Period (the "Billing Commencement Date"), regardless of whether all setup activities have been ' +
        "completed by such date, except where the delay in setup is solely and directly attributable to ABBA.</p>"
    );
  });

  it("renders empty when the Sales-Consultant setup checkbox is off — matching V1's `hasSetupSection ? ... : \`\`` fallback", () => {
    expect(renderNode(setupFeeIntro, { ...ctx, conditionCtx: { setupEnabled: false } })).toBe("");
  });
});

describe("renderSection / renderDocument — BODY vs ANNEX heading + ordering", () => {
  const feesSection = {
    sectionKey: "feesAndPayment",
    title: "IV. Fees and Terms of Payment",
    kind: "BODY",
    sortOrder: 1,
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body text." }] }] },
  };
  const annexASection = {
    sectionKey: "annexA",
    title: "Annex A — Billing Commencement",
    kind: "ANNEX",
    sortOrder: 2,
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Annex text." }] }] },
  };

  it("a BODY section renders an h2, an ANNEX section renders an h1 with an annex class", () => {
    const html = renderDocument([annexASection, feesSection], {});
    // sortOrder governs output order regardless of input array order.
    expect(html.indexOf('data-section-key="feesAndPayment"')).toBeLessThan(html.indexOf('data-section-key="annexA"'));
    expect(html).toContain('<section data-section-key="feesAndPayment"><h2>IV. Fees and Terms of Payment</h2><p>Body text.</p></section>');
    expect(html).toContain('<section data-section-key="annexA" class="annex"><h1>Annex A — Billing Commencement</h1><p>Annex text.</p></section>');
  });
});
