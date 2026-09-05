// Assigns each entity a contiguous 1-indexed position interval for a given
// quantity driver, computed BEFORE any shape or rule evaluates — pooling
// is not a rule type. Entities are ordered by `poolOrder` (poolOrder 0 is
// always the primary company, matching V1's own list-order convention).
//
// PER_ENTITY components ignore pooling entirely: every entity gets its own
// [1, qty] interval, as if it were the only company on the quote.
export function resolveIntervals({ poolingPolicy, entities, driverKey }) {
  if (poolingPolicy === "PER_ENTITY" || entities.length <= 1) {
    return entities.map((e) => ({
      quoteEntityId: e.id,
      start: 1,
      end: qtyFor(e, driverKey),
    }));
  }

  const sorted = [...entities].sort((a, b) => a.poolOrder - b.poolOrder);
  let cursor = 1;
  const intervals = [];
  for (const e of sorted) {
    const qty = qtyFor(e, driverKey);
    if (qty <= 0) {
      intervals.push({ quoteEntityId: e.id, start: cursor, end: cursor - 1 }); // empty interval
      continue;
    }
    intervals.push({ quoteEntityId: e.id, start: cursor, end: cursor + qty - 1 });
    cursor += qty;
  }
  return intervals;
}

function qtyFor(entity, driverKey) {
  const q = entity.quantities?.find((q) => q.driverKey === driverKey);
  return q ? Number(q.value) : 0;
}

export function pooledTotal(entities, driverKey) {
  return entities.reduce((sum, e) => sum + qtyFor(e, driverKey), 0);
}
