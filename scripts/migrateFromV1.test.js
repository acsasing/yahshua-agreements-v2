import { describe, it, expect } from "vitest";
import { mapRole, slugify } from "./migrateFromV1.mjs";

// Pure-function coverage for the migration script's non-DB logic. The
// script's actual DB-to-DB behavior is proven by running it for real
// against V1's own dev database (documented in the PR, not automated
// here — there's no V1 schema/fixture data available in CI to run it
// against safely).

describe("mapRole", () => {
  it("TEAM -> CONSULTANT", () => {
    expect(mapRole("TEAM")).toBe("CONSULTANT");
  });

  it("ADMIN and SUPER_ADMIN both collapse into V2's single Admin tier", () => {
    expect(mapRole("ADMIN")).toBe("ADMIN");
    expect(mapRole("SUPER_ADMIN")).toBe("ADMIN");
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("PBCOM Test")).toBe("pbcom-test");
  });

  it("strips non-alphanumerics and leading/trailing hyphens", () => {
    expect(slugify("  Globe! (Referral) ")).toBe("globe-referral");
  });

  it("falls back to 'partner' for an empty/missing name", () => {
    expect(slugify("")).toBe("partner");
    expect(slugify(undefined)).toBe("partner");
  });
});
