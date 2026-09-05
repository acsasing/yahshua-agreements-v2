// Discount approval tiers: Sales Consultant <=5%, CSMO 5-10%, CSMO
// concurrence + COO/Finance Head above 10% — the same thresholds and tier
// logic as V1's shared/discountApprovalPolicy.js, ported verbatim. What's
// genuinely different is HOW the effective discount % is computed: V1
// needed a hardcoded DISCOUNT_FIELD_KEYS list (every discount-bearing
// field name across every business type) because its pricing state was
// one big untyped blob. V2's Pricing Engine already has a real, closed
// mechanism for exactly this distinction — a PricingRule is catalog-level,
// a QuoteAdjustment is quote-level (see the architecture plan) — so the
// baseline/actual split falls out of that mechanism directly: baseline =
// catalog rules only, actual = catalog rules + this quote's own
// QuoteAdjustment rows, both run through the SAME evaluateRuleSet pass
// (not sequential/compounding, matching evaluateRuleSet's own additive-
// against-gross semantics). No field-name list to keep in sync, ever —
// a 9th business type needs zero changes here.

import { evaluateRuleSet } from "./rules.js";

export const DISCOUNT_APPROVAL_THRESHOLDS = { csmo: 5, coo: 10 };

function pctReduction(baselineAmount, actualAmount) {
  if (!baselineAmount || baselineAmount <= 0) return 0;
  return Math.max(0, (1 - actualAmount / baselineAmount) * 100);
}

// A QuoteAdjustment has no condition mechanism of its own (unlike a
// catalog PricingRule) — it's already scoped to one specific quote by a
// human choosing to add it, so it always applies once its scope/
// chargeKind/window match. `conditions: []` is exactly how the closed
// rule grammar spells "unconditional" (see rules.js's own module comment),
// so this reuses evaluateRuleSet as-is rather than a second parallel
// evaluator.
function adjustmentAsRule(adj) {
  return {
    id: adj.id,
    effectType: adj.effectType,
    effectValue: adj.effectValue,
    appliesToChargeKind: adj.appliesToChargeKind ?? null,
    isActive: true,
    conditions: [],
  };
}

function adjustmentAppliesToLine(adjustment, line) {
  if (adjustment.appliesToChargeKind && adjustment.appliesToChargeKind !== line.chargeKind) return false;
  if (adjustment.scope === "COMPONENT") return adjustment.componentId === line.componentId;
  if (adjustment.scope === "PRODUCT") return adjustment.productId === line.productId;
  return adjustment.scope === "QUOTE_TOTAL"; // a whole-quote adjustment touches every line.
}

/**
 * `lines`: one entry per already-priced QuoteLine-shaped charge —
 *   { chargeKind: "RECURRING"|"ONE_TIME", componentId, productId, grossAmount, catalogRules }
 *   `catalogRules` is exactly what resolveRulesForRateCard(...) already
 *   resolves for that component/product/quote-total scope — the same
 *   rules priceComponent()/applyScopeRules() apply during normal pricing.
 * `adjustments`: this quote's own QuoteAdjustment rows (all of them —
 *   scope filtering happens per-line above).
 * `ctx`: the same rule-evaluation context (lockinYears, rateCardId, ...)
 *   used elsewhere in the Pricing Engine.
 */
export function computeEffectiveDiscountPct(lines, adjustments, ctx) {
  let baselineRecurring = 0;
  let actualRecurring = 0;
  let baselineOneTime = 0;
  let actualOneTime = 0;

  for (const line of lines) {
    const lineCtx = { ...ctx, chargeKind: line.chargeKind };
    const baseline = evaluateRuleSet(line.catalogRules, line.grossAmount, lineCtx);

    const relevantAdjustments = (adjustments || []).filter((a) => adjustmentAppliesToLine(a, line)).map(adjustmentAsRule);
    const actual = evaluateRuleSet([...(line.catalogRules || []), ...relevantAdjustments], line.grossAmount, lineCtx);

    if (line.chargeKind === "RECURRING") {
      baselineRecurring += baseline.netAmount;
      actualRecurring += actual.netAmount;
    } else {
      baselineOneTime += baseline.netAmount;
      actualOneTime += actual.netAmount;
    }
  }

  return {
    monthlyPct: pctReduction(baselineRecurring, actualRecurring),
    setupPct: pctReduction(baselineOneTime, actualOneTime),
  };
}

/** "NONE" | "CSMO" | "COO" for one effective-discount percentage. */
export function requiredApprovalTier(pct) {
  if (pct > DISCOUNT_APPROVAL_THRESHOLDS.coo) return "COO";
  if (pct > DISCOUNT_APPROVAL_THRESHOLDS.csmo) return "CSMO";
  return "NONE";
}

const TIER_RANK = { NONE: 0, CSMO: 1, COO: 2 };

/**
 * The single highest tier required across Monthly and Setup — either one
 * crossing a threshold is enough to require that tier (a Setup-only
 * giveaway needs the same scrutiny as a Monthly-only one), matching V1's
 * "judged separately" design exactly.
 */
export function getRequiredApprovalTier(lines, adjustments, ctx) {
  const { monthlyPct, setupPct } = computeEffectiveDiscountPct(lines, adjustments, ctx);
  const monthlyTier = requiredApprovalTier(monthlyPct);
  const setupTier = requiredApprovalTier(setupPct);
  const tier = TIER_RANK[monthlyTier] >= TIER_RANK[setupTier] ? monthlyTier : setupTier;
  return { tier, monthlyPct, setupPct };
}
