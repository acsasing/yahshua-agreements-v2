// VAT mode is an explicit per-component setting (generalizing the ONE
// place V1 already got this right — CustomAgreementDocument.pricingConfig
// .vatMode — to every component, instead of an assumption hardcoded per
// business-type/engagement combination the way calcAll/calcAllService do
// today).
export function applyVat(netAmount, vatMode, vatRatePct) {
  const rate = Number(vatRatePct) / 100;
  if (vatMode === "NONE") {
    return { vatAmount: 0, totalAmount: round2(netAmount) };
  }
  if (vatMode === "INCLUSIVE") {
    // The quoted net amount already includes VAT — back it out rather
    // than adding on top, so the "list price" the client sees never
    // silently grows past what was actually published.
    const base = netAmount / (1 + rate);
    const vatAmount = netAmount - base;
    return { vatAmount: round2(vatAmount), totalAmount: round2(netAmount) };
  }
  // EXCLUSIVE (the default): VAT is added on top of the net amount.
  const vatAmount = netAmount * rate;
  return { vatAmount: round2(vatAmount), totalAmount: round2(netAmount + vatAmount) };
}

// Round to 2 decimal places exactly once, at the line level, after every
// other computation — never accumulate rounding error across a schedule
// by rounding intermediate values.
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
