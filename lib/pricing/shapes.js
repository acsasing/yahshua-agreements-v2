// The six pricing shapes, each a pure function over a POSITION INTERVAL
// (not a raw quantity) — this is the key structural decision that makes
// quantity pooling (Parent+Subsidiary groups) fall out for free instead
// of needing hand-written special-casing in every shape:
//
//   - A non-pooled component evaluates over [1, qty] — the ordinary case.
//   - A pooled component evaluates each entity over its own contiguous
//     slice of the group's combined range (see pooling.js), and a
//     base/one-time fee firing only when `start === 1` is exactly how
//     V1's "the base fee only charges once per group" behavior emerges,
//     with no `groupOffset === 0` special case written by hand.
//
// TIER_LOOKUP is the one shape that is NOT position-aware — it selects a
// bracket by a plain quantity (never pooled in V1: Facial Recognition,
// the only real cliff-tiered case, is never combined across a group), so
// it takes `quantity` directly rather than an interval.

export function evaluateShape({ shape, config, tiers = [], interval, quantities }) {
  switch (shape) {
    case "FLAT":
      return evalFlat(config);
    case "PER_UNIT":
      return evalPerUnit(config, interval);
    case "BASE_PLUS_EXCESS":
      return evalBasePlusExcess(config, interval);
    case "TIER_LOOKUP":
      return evalTierLookup(config, tiers, interval);
    case "TIER_PROGRESSIVE":
      return evalTierProgressive(config, tiers, interval);
    case "MULTI_FACTOR":
      return evalMultiFactor(config, quantities || {});
    default:
      throw new Error(`Unknown pricing shape: ${shape}`);
  }
}

function intervalQuantity(interval) {
  if (!interval) return 0;
  return Math.max(0, interval.end - interval.start + 1);
}

function evalFlat(config) {
  const amount = Number(config.amount) || 0;
  return { amount, breakdown: { kind: "flat", amount } };
}

function evalPerUnit(config, interval) {
  const qty = intervalQuantity(interval);
  const rate = Number(config.rate) || 0;
  const amount = qty * rate;
  return { amount, breakdown: { kind: "perUnit", quantity: qty, rate } };
}

// Base fee covers `includedUnits`; a single flat `excessRate` applies to
// every unit beyond that. The base fee is charged only when this
// interval's `start === 1` — i.e. only to whichever entity in a pooled
// group holds the first position — matching V1's
// `groupOffset === 0 ? p.base : 0` exactly, without a special case here.
function evalBasePlusExcess(config, interval) {
  const { base, includedUnits, excessRate } = config;
  const start = interval?.start ?? 1;
  const end = interval?.end ?? 0;
  const billableStart = Math.max(start, Number(includedUnits) + 1);
  const excess = Math.max(0, end - billableStart + 1);
  const baseFee = start === 1 ? Number(base) || 0 : 0;
  const excessAmount = excess * (Number(excessRate) || 0);
  return {
    amount: baseFee + excessAmount,
    breakdown: { kind: "basePlusExcess", baseFee, excess, excessRate: Number(excessRate) || 0, excessAmount },
  };
}

// Tax-bracket-style: the excess range is split across whichever tiers it
// overlaps, each portion billed at that tier's own rate, and the amounts
// summed (Globe/LMI Payroll: 101-500 at one rate, 501-1000 at the next,
// ...). Distinct from TIER_LOOKUP, which bills the WHOLE quantity at one
// selected bracket's rate.
function evalTierProgressive(config, tiers, interval) {
  const { base, includedUnits } = config;
  const start = interval?.start ?? 1;
  const end = interval?.end ?? 0;
  const billableStart = Math.max(start, Number(includedUnits) + 1);
  const baseFee = start === 1 ? Number(base) || 0 : 0;

  if (end < billableStart) {
    return { amount: baseFee, breakdown: { kind: "tierProgressive", baseFee, tierBreakdown: [] } };
  }

  const sorted = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder);
  let pos = billableStart;
  let excessTotal = 0;
  const tierBreakdown = [];
  for (const t of sorted) {
    if (pos > end) break;
    const tierMin = t.minUnit;
    const tierMax = t.maxUnit == null ? Infinity : t.maxUnit;
    if (tierMax < pos) continue;
    const segStart = Math.max(pos, tierMin);
    const segEnd = Math.min(end, tierMax);
    if (segEnd < segStart) continue;
    const count = segEnd - segStart + 1;
    const rate = Number(t.value) || 0;
    excessTotal += count * rate;
    tierBreakdown.push({ min: segStart, max: segEnd, count, rate });
    pos = segEnd + 1;
  }
  return { amount: baseFee + excessTotal, breakdown: { kind: "tierProgressive", baseFee, tierBreakdown } };
}

// Cliff/whole-quantity lookup: one bracket is selected (by `lookupBasis`
// quantity) and its value applied across `billingBasis` quantity.
// Facial Recognition needs BOTH bands simultaneously in one document —
// its base fee is looked up AND billed by total headcount, while its
// excess rate is looked up by total headcount but billed only against
// the excess beyond `includedUnits` — hence two separate bands rather
// than one.
function evalTierLookup(config, tiers, interval) {
  const {
    lookupBasis = "TOTAL",
    billingBasis = "TOTAL",
    includedUnits = 0,
    tierValueKind = "FLAT_AMOUNT",
    clampLookupToIncluded = false,
  } = config;
  const totalQty = intervalQuantity(interval);
  let lookupQty = lookupBasis === "EXCESS" ? Math.max(0, totalQty - Number(includedUnits)) : totalQty;
  // Facial Recognition's base-fee table only covers brackets 1..includedUnits
  // (1-50, 51-100) — for any headcount beyond that, V1 still looks up the
  // TOP base bracket rather than falling off the table entirely, since the
  // excess is billed separately by the excess-rate table. Clamping here is
  // what reproduces that without a second, redundant "else" branch.
  if (clampLookupToIncluded && lookupBasis === "TOTAL") {
    lookupQty = Math.min(Math.max(lookupQty, 1), Number(includedUnits));
  }
  const billQty = billingBasis === "EXCESS" ? Math.max(0, totalQty - Number(includedUnits)) : totalQty;

  const sorted = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder);
  const matched = sorted.find((t) => lookupQty >= t.minUnit && (t.maxUnit == null || lookupQty <= t.maxUnit));
  if (!matched) {
    return { amount: 0, breakdown: { kind: "tierLookup", matched: null, totalQty } };
  }
  const rate = Number(matched.value) || 0;
  const amount = tierValueKind === "PER_UNIT_RATE" ? rate * billQty : rate;
  return {
    amount,
    breakdown: { kind: "tierLookup", matchedTier: [matched.minUnit, matched.maxUnit], rate, billQty, tierValueKind },
  };
}

// rate x (sum of group1 quantities) x (sum of group2 quantities) x ...
// Face-to-Face: dailyRate x personnel x (trainingDays + travelDays) is
// `factorGroups: [["personnel"], ["trainingDays","travelDays"]]`. No
// operators, no parser — the grouping itself is the only structure
// admitted, closed by construction.
function evalMultiFactor(config, quantities) {
  const { rate, rateInputDriverKey, factorGroups = [] } = config;
  const resolvedRate = rateInputDriverKey ? Number(quantities[rateInputDriverKey]) || 0 : Number(rate) || 0;
  let amount = resolvedRate;
  const groupSums = [];
  for (const group of factorGroups) {
    const sum = group.reduce((a, key) => a + (Number(quantities[key]) || 0), 0);
    groupSums.push({ keys: group, sum });
    amount *= sum;
  }
  return { amount, breakdown: { kind: "multiFactor", rate: resolvedRate, groupSums } };
}
