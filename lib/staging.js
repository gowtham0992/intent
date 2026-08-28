import { evaluateOffer } from "./mandate.js";

export function stageCandidate({ offers, mandate, currentVersion, requestedVersion, variantId, authority }) {
  if (authority !== "absent") throw new TypeError("A proposal cannot change while checkout authority is live or spent.");
  if (!Number.isInteger(requestedVersion) || requestedVersion !== currentVersion) {
    throw new TypeError(`Stale mandate version. Read mandate v${currentVersion} and evaluate again.`);
  }
  if (typeof variantId !== "string" || variantId.length < 1 || variantId.length > 512) {
    throw new TypeError("Invalid candidate variant.");
  }
  const offer = offers.find((candidate) => candidate.variantId === variantId);
  if (!offer) throw new TypeError("Candidate is not in the live decision room.");
  const decision = evaluateOffer(offer, mandate);
  if (!decision.eligible) {
    throw new TypeError(`Candidate is blocked by the current mandate: ${decision.reasons.join("; ")}`);
  }
  return Object.freeze({ offer, mandateVersion: currentVersion });
}
