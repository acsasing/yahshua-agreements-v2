import { describe, it, expect } from "vitest";
import { resolveIntervals, pooledTotal } from "./pooling.js";

describe("resolveIntervals — Parent+Subsidiary quantity pooling", () => {
  const entities = [
    { id: "A", poolOrder: 0, quantities: [{ driverKey: "employees", value: 80 }] },
    { id: "B", poolOrder: 1, quantities: [{ driverKey: "employees", value: 40 }] },
  ];

  it("POOLED: each entity gets a contiguous slice of the combined range", () => {
    const intervals = resolveIntervals({ poolingPolicy: "POOLED", entities, driverKey: "employees" });
    expect(intervals).toEqual([
      { quoteEntityId: "A", start: 1, end: 80 },
      { quoteEntityId: "B", start: 81, end: 120 },
    ]);
  });

  it("PER_ENTITY: every entity gets its own [1, qty], ignoring the group entirely", () => {
    const intervals = resolveIntervals({ poolingPolicy: "PER_ENTITY", entities, driverKey: "employees" });
    expect(intervals).toEqual([
      { quoteEntityId: "A", start: 1, end: 80 },
      { quoteEntityId: "B", start: 1, end: 40 },
    ]);
  });

  it("pooledTotal sums across every entity regardless of order", () => {
    expect(pooledTotal(entities, "employees")).toBe(120);
  });

  it("a single-entity quote never pools even if the component's policy is POOLED", () => {
    const solo = [{ id: "A", poolOrder: 0, quantities: [{ driverKey: "employees", value: 55 }] }];
    const intervals = resolveIntervals({ poolingPolicy: "POOLED", entities: solo, driverKey: "employees" });
    expect(intervals).toEqual([{ quoteEntityId: "A", start: 1, end: 55 }]);
  });
});
