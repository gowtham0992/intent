export function summarizeComparison(decisions, mandateVersion) {
  if (!Number.isInteger(mandateVersion) || mandateVersion < 1) throw new TypeError("Invalid mandate version for comparison audit.");
  if (!Array.isArray(decisions)) throw new TypeError("Comparison decisions must be a list.");

  let checkCount = 0;
  let eligibleCount = 0;
  for (const decision of decisions) {
    if (!decision || typeof decision.eligible !== "boolean") throw new TypeError("Invalid comparison decision.");
    if (!Array.isArray(decision.checks)) throw new TypeError("Comparison decision checks must be a list.");
    checkCount += decision.checks.length;
    if (decision.eligible) eligibleCount += 1;
  }

  return Object.freeze({
    mandateVersion,
    candidateCount: decisions.length,
    checkCount,
    eligibleCount,
    blockedCount: decisions.length - eligibleCount
  });
}
