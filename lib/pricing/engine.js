// The top-level orchestrator — pure functions only, no Prisma import here
// (same discipline V1's shared/pricing.js already kept), so the engine is
// testable against plain JS fixtures and reusable from anywhere (an API
// route, a seed-parity script, a future MCP tool) without dragging a
// database connection into a unit test.
//
// Deterministic application order, as documented in the architecture
// plan: per-COMPONENT rules apply to that component's own gross, summed;
// per-PRODUCT rules apply to the product's post-component net, summed;
// per-QUOTE_TOTAL rules apply to the whole quote's post-product net,
// summed; and finally — confirmed with the user — a manual override, if
// enabled, REPLACES the computed total outright. Nothing stacks on top of
// a manual override; this is a deliberate behavior change from V1, where
// a total discount still reduces an already-manually-overridden price.

import { evaluateShape } from "./shapes.js";
import { resolveIntervals } from "./pooling.js";
import { evaluateRuleSet, resolveRulesForRateCard } from "./rules.js";
import { applyVat, round2 } from "./vat.js";

// Prices one component across every entity on the quote (or once, for a
// non-entity-scoped component), returning one QuoteLine-shaped object per
// entity plus the applied component-scope rules.
//
// `component.id` MUST be the PricingComponent's own id — never the
// PricingComponentVersion's id — because that's exactly what
// PricingRule.componentId references. Callers typically hold a component
// with a nested `versions[0]`; merge the two before calling, e.g.
// `{ id: payrollSetup.id, ...payrollSetup.versions[0] }`, not
// `payrollSetup.versions[0]` alone (whose own `.id` is a different row).
export function priceComponent({ component, rateCardEntry, entities, rateCardRules, ctx, chargeKind }) {
  const shape = rateCardEntry.shapeOverride || component.shape;
  const config = rateCardEntry.config;
  const tiers = rateCardEntry.tiers || [];

  const relevantEntities = component.quantityDriverKey ? entities : [{ id: null, poolOrder: 0, quantities: [] }];
  const intervals =
    shape === "MULTI_FACTOR" || !component.quantityDriverKey
      ? relevantEntities.map((e) => ({ quoteEntityId: e.id }))
      : resolveIntervals({
          poolingPolicy: component.poolingPolicy,
          entities: relevantEntities,
          driverKey: component.quantityDriverKey,
        });

  const applicableRules = resolveRulesForRateCard(
    rateCardRules.filter((r) => r.scope === "COMPONENT" && r.componentId === component.id),
    ctx.rateCardId
  );

  const lines = intervals.map((interval) => {
    const quantities = quantitiesFor(relevantEntities, interval.quoteEntityId, component.quantityDriverKey);
    const { amount: gross, breakdown } = evaluateShape({ shape, config, tiers, interval, quantities });

    const ruleCtx = { ...ctx, chargeKind, entityQuantities: quantities, pooledQuantities: ctx.pooledQuantities };
    const { netAmount, discountAmount, applications } = evaluateRuleSet(applicableRules, gross, ruleCtx);

    const vatMode = rateCardEntry.vatModeOverride || component.vatMode;
    const { vatAmount, totalAmount } = applyVat(netAmount, vatMode, ctx.vatRatePct);

    return {
      componentId: component.id,
      quoteEntityId: interval.quoteEntityId,
      chargeKind,
      quantity: quantityOf(interval),
      positionStart: interval.start ?? null,
      positionEnd: interval.end ?? null,
      grossAmount: round2(gross),
      discountAmount: round2(discountAmount),
      netAmount: round2(netAmount),
      vatMode,
      vatRatePct: ctx.vatRatePct,
      vatAmount,
      totalAmount,
      breakdown,
      applications,
    };
  });

  return lines;
}

function quantityOf(interval) {
  if (interval.start == null || interval.end == null) return null;
  return interval.end - interval.start + 1;
}

function quantitiesFor(entities, entityId, driverKey) {
  const entity = entities.find((e) => e.id === entityId) || entities[0];
  const map = {};
  for (const q of entity?.quantities || []) map[q.driverKey] = Number(q.value);
  return map;
}

// Rolls a set of already-priced QuoteLines up to a single scope total,
// applies that scope's rules (PRODUCT or QUOTE_TOTAL), and returns the
// resulting net + the rule applications for audit.
export function applyScopeRules(lines, scopeRules, ctx, chargeKind) {
  const gross = lines.filter((l) => l.chargeKind === chargeKind).reduce((sum, l) => sum + l.netAmount, 0);
  const applicable = resolveRulesForRateCard(scopeRules, ctx.rateCardId);
  return evaluateRuleSet(applicable, gross, { ...ctx, chargeKind });
}

// The final step, confirmed with the user: a manual override REPLACES the
// computed total outright — no QUOTE_TOTAL rule, no further discount,
// stacks on top of it. Requires a reason to be recorded (V1 never did).
export function applyManualOverride(computedAmount, manualOverride) {
  if (!manualOverride?.enabled) return { amount: computedAmount, overridden: false };
  if (!manualOverride.reason) {
    throw new Error("A manual override requires a reason to be recorded.");
  }
  return { amount: Number(manualOverride.amount) || 0, overridden: true };
}
