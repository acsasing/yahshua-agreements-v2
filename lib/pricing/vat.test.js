import { describe, it, expect } from "vitest";
import { applyVat, round2 } from "./vat.js";

describe("applyVat", () => {
  it("EXCLUSIVE: matches the live V1 Direct Payroll screenshot exactly — PHP 7,000 net + 12% VAT = PHP 7,840.00", () => {
    const { vatAmount, totalAmount } = applyVat(7000, "EXCLUSIVE", 12);
    expect(vatAmount).toBe(840);
    expect(totalAmount).toBe(7840);
  });

  it("INCLUSIVE: backs VAT out of an already-VAT-inclusive published rate rather than adding on top", () => {
    const { vatAmount, totalAmount } = applyVat(112, "INCLUSIVE", 12);
    expect(vatAmount).toBe(12);
    expect(totalAmount).toBe(112); // the published price never silently grows
  });

  it("NONE: no VAT at all (Face-to-Face's real behavior in V1 — it applies no VAT anywhere)", () => {
    const { vatAmount, totalAmount } = applyVat(300000, "NONE", 12);
    expect(vatAmount).toBe(0);
    expect(totalAmount).toBe(300000);
  });
});

describe("round2", () => {
  it("rounds half-up to exactly 2 decimal places, once", () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(1234.5)).toBe(1234.5);
  });
});
