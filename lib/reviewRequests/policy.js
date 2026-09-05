// The Review Request state machine — factored out of the API route
// (unlike V1, which inlined this directly in app/api/review-requests/
// public/[token]/act/route.js) so it's independently testable against
// every real branch without needing a running server or a database.
//
// Deliberately pure: takes the request row, the acting user's freshly-
// fetched job-function flags, the live-recomputed discount tier, and the
// requested action/note, and returns either a Prisma `data` patch to
// apply plus an audit message, or a rejection with an HTTP-shaped status.
// The route stays a thin wrapper: fetch, call this, apply the patch,
// write the audit log.

export function applyReviewAction({ request, actor, action, note, tier }) {
  if (request.status === "RESOLVED" || request.status === "DECLINED") {
    return reject(410, "This request has already been resolved.");
  }

  const trimmedNote = note?.trim() || null;
  const now = new Date();

  if (request.kind === "SUPERVISOR") {
    return applySupervisorAction({ actor, action, trimmedNote, now, request });
  }
  return applyDiscountAction({ actor, action, trimmedNote, now, request, tier });
}

function applySupervisorAction({ actor, action, trimmedNote, now, request }) {
  if (action !== "NOTE" && action !== "DECLINE") {
    return reject(400, "Invalid action for a Supervisor review.");
  }
  if (!actor.isSupervisor) {
    return reject(403, "You're not designated as a Supervisor — ask whoever holds that flag to open this link instead.");
  }
  if (!trimmedNote) {
    return reject(400, "A note is required.");
  }
  return accept({
    data: {
      status: action === "DECLINE" ? "DECLINED" : "RESOLVED",
      finalActedById: actor.id,
      finalActedAt: now,
      finalNote: trimmedNote,
      resolvedAt: now,
    },
    auditMessage: `Supervisor review ${action === "DECLINE" ? "flagged" : "noted"} by ${actor.name}`,
  });
}

// `tier`/`monthlyPct`/`setupPct` are always recomputed live off the
// agreement's CURRENT quote (see lib/pricing/discountApproval.js) —
// never off request.discountSnapshotPct, since the Sales Consultant may
// have edited the discount, up or down, since the link was created.
function applyDiscountAction({ actor, action, trimmedNote, now, request, tier }) {
  const { tier: requiredTier, monthlyPct, setupPct } = tier;

  if (action === "DECLINE") {
    if (!trimmedNote) return reject(400, "A reason is required to decline.");
    const isCurrentApprover = request.status === "AWAITING_COO" ? actor.isCooApprover : actor.isCsmoApprover;
    if (!isCurrentApprover) {
      return reject(403, "You're not the designated approver for this request's current stage.");
    }
    return accept({
      data: { status: "DECLINED", finalActedById: actor.id, finalActedAt: now, finalNote: trimmedNote, resolvedAt: now },
      auditMessage: `Discount request declined by ${actor.name}`,
    });
  }

  if (request.status === "PENDING") {
    if (!actor.isCsmoApprover) {
      return reject(403, "You're not designated as a CSMO Approver — ask whoever holds that flag to open this link instead.");
    }
    if (requiredTier === "COO") {
      if (action !== "CONCUR") {
        return reject(400, "This discount is above 10% — concur first, then it goes to a COO/Finance Head Approver.");
      }
      return accept({
        data: { status: "AWAITING_COO", csmoActedById: actor.id, csmoActedAt: now, csmoNote: trimmedNote },
        auditMessage: `Discount concurred by ${actor.name} (CSMO) — awaiting COO/Finance Head approval`,
      });
    }
    // requiredTier is CSMO (5-10%) or NONE (the Sales Consultant has since
    // lowered it) — either way this resolves directly on a single CSMO action.
    if (action !== "APPROVE" && action !== "CONCUR") {
      return reject(400, "Expected an approval action.");
    }
    return accept({
      data: {
        status: "RESOLVED",
        resolvedTier: "CSMO",
        resolvedMonthlyPct: monthlyPct,
        resolvedSetupPct: setupPct,
        csmoActedById: actor.id,
        csmoActedAt: now,
        csmoNote: trimmedNote,
        finalActedById: actor.id,
        finalActedAt: now,
        finalNote: trimmedNote,
        resolvedAt: now,
      },
      auditMessage: `Discount approved by ${actor.name} (CSMO)`,
    });
  }

  if (request.status === "AWAITING_COO") {
    if (!actor.isCooApprover) {
      return reject(403, "You're not designated as a COO/Finance Head Approver — ask whoever holds that flag to open this link instead.");
    }
    if (action !== "APPROVE") return reject(400, "Expected an approval action.");
    return accept({
      data: {
        status: "RESOLVED",
        resolvedTier: "COO",
        resolvedMonthlyPct: monthlyPct,
        resolvedSetupPct: setupPct,
        finalActedById: actor.id,
        finalActedAt: now,
        finalNote: trimmedNote,
        resolvedAt: now,
      },
      auditMessage: `Discount given final approval by ${actor.name} (COO/Finance Head)`,
    });
  }

  return reject(409, "Unexpected request status.");
}

function accept({ data, auditMessage }) {
  return { ok: true, data, auditMessage };
}

function reject(status, error) {
  return { ok: false, status, error };
}

/**
 * "Covered" for the Finalize gate: the agreement's CURRENT effective
 * discount % (see lib/pricing/discountApproval.js) must be <= whatever
 * was actually approved, not merely "some request of a sufficient tier
 * was resolved at some point" — matching resolvedMonthlyPct/
 * resolvedSetupPct's own doc comment in the schema.
 */
export function isDiscountCovered(resolvedRequest, currentMonthlyPct, currentSetupPct) {
  if (!resolvedRequest || resolvedRequest.status !== "RESOLVED") return false;
  const monthlyCovered = currentMonthlyPct <= (resolvedRequest.resolvedMonthlyPct ?? 0);
  const setupCovered = currentSetupPct <= (resolvedRequest.resolvedSetupPct ?? 0);
  return monthlyCovered && setupCovered;
}
