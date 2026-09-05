// The closed rule grammar: a flat AND-list of typed conditions plus one
// effect. No nesting, no OR, no arithmetic, no expression parser — need
// an "or"? Author two independent rules. This is deliberately a bounded
// loop over typed rows, never anything that evaluates admin- or user-
// authored code on the server.

export function evaluateConditions(conditions, ctx) {
  return (conditions || []).every((cond) => evaluateCondition(cond, ctx));
}

function evaluateCondition(cond, ctx) {
  switch (cond.type) {
    case "LOCKIN_YEARS_AT_LEAST":
      return (ctx.lockinYears ?? 0) >= cond.intValue;
    case "TERM_MONTHS_AT_LEAST":
      return (ctx.termMonths ?? 0) >= cond.intValue;
    case "QUANTITY_AT_LEAST":
      return getQuantity(ctx, cond) >= Number(cond.decimalValue);
    case "QUANTITY_AT_MOST":
      return getQuantity(ctx, cond) <= Number(cond.decimalValue);
    case "BILLING_DATE_WITHIN": {
      const d = ctx.billingDate;
      if (!d) return false;
      if (cond.dateFrom && d < cond.dateFrom) return false;
      if (cond.dateTo && d > cond.dateTo) return false;
      return true;
    }
    case "RATE_CARD_IS":
      return (cond.stringValues || []).includes(ctx.rateCardKey);
    case "PRODUCT_SELECTED":
      return (cond.stringValues || []).some((k) => (ctx.selectedProductKeys || []).includes(k));
    case "SETUP_ENABLED":
      return !!ctx.setupEnabled === !!cond.boolValue;
    default:
      throw new Error(`Unknown condition type: ${cond.type}`);
  }
}

function getQuantity(ctx, cond) {
  const basis = cond.quantityBasis || "ENTITY";
  const map = basis === "POOLED" ? ctx.pooledQuantities : ctx.entityQuantities;
  return Number(map?.[cond.quantityDriverKey]) || 0;
}

// Applies every applicable rule against the ORIGINAL gross amount
// (gross-based and additive, not sequential/compounding), then sums and
// clamps at zero — matching V1's per-solution discount behavior. A rule
// with ZERO conditions is unconditional (there is no ALWAYS condition
// type; the empty list itself means "always applies").
//
// A WAIVE rule short-circuits everything else to zero, same as V1
// treating "waived" as a distinct, total state rather than "100% off"
// stacked with other discounts.
export function evaluateRuleSet(rules, grossAmount, ctx) {
  const applicable = (rules || []).filter(
    (r) =>
      r.isActive !== false &&
      (!r.appliesToChargeKind || r.appliesToChargeKind === ctx.chargeKind) &&
      evaluateConditions(r.conditions, ctx)
  );

  const waiveRule = applicable.find((r) => r.effectType === "WAIVE");
  if (waiveRule) {
    return {
      netAmount: 0,
      discountAmount: grossAmount,
      applications: [{ ruleId: waiveRule.id, effectType: "WAIVE", amount: grossAmount }],
    };
  }

  let totalDiscount = 0;
  const applications = [];
  for (const rule of applicable) {
    const discount =
      rule.effectType === "PERCENT_OFF" ? grossAmount * (Number(rule.effectValue) / 100) : Number(rule.effectValue) || 0;
    totalDiscount += discount;
    applications.push({ ruleId: rule.id, effectType: rule.effectType, amount: discount });
  }
  const clampedDiscount = Math.min(totalDiscount, grossAmount);
  return { netAmount: Math.max(0, grossAmount - totalDiscount), discountAmount: clampedDiscount, applications };
}

// Rate-card-scoped rule resolution: for a given `key`, a rule row scoped
// to THIS rate card replaces the null-scoped (applies-everywhere) row
// entirely; otherwise the null-scoped row applies. Rules with different
// keys always union. This is how "Sterling's setup-fee waiver kicks in at
// 2 years, everyone else's at 3" is three visible rows, not an inheritance
// surprise.
export function resolveRulesForRateCard(allRules, rateCardId) {
  const byKey = new Map();
  for (const rule of allRules) {
    const existing = byKey.get(rule.key);
    if (!existing) {
      byKey.set(rule.key, rule);
      continue;
    }
    // A rate-card-scoped row always wins over a null-scoped row for the
    // same key, regardless of which was encountered first.
    if (rule.rateCardId === rateCardId && existing.rateCardId !== rateCardId) {
      byKey.set(rule.key, rule);
    }
  }
  return [...byKey.values()].filter((r) => r.rateCardId === null || r.rateCardId === rateCardId);
}
