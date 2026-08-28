import test from "node:test";
import assert from "node:assert/strict";
import { stageCandidate } from "../lib/staging.js";

const mandate = { maxAmountMinor: 6000, currency: "USD", minimumRating: 4.5, minimumReviews: 100 };
const eligible = {
  productId: "product-1",
  variantId: "variant-1",
  title: "65W charger",
  seller: { name: "Example merchant" },
  available: true,
  price: { amountMinor: 3999, currency: "USD" },
  rating: { value: 4.8, count: 500 },
  evidence: { features: [] }
};

test("agent stages an eligible candidate against the exact current mandate version", () => {
  const proposal = stageCandidate({ offers: [eligible], mandate, currentVersion: 2, requestedVersion: 2, variantId: "variant-1", authority: "absent" });
  assert.equal(proposal.offer, eligible);
  assert.equal(proposal.mandateVersion, 2);
});

test("stale, unknown, and blocked agent proposals fail closed", () => {
  assert.throws(
    () => stageCandidate({ offers: [eligible], mandate, currentVersion: 3, requestedVersion: 2, variantId: "variant-1", authority: "absent" }),
    /stale/i
  );
  assert.throws(
    () => stageCandidate({ offers: [eligible], mandate, currentVersion: 2, requestedVersion: 2, variantId: "missing", authority: "absent" }),
    /not in the live decision room/i
  );
  assert.throws(
    () => stageCandidate({ offers: [{ ...eligible, price: { amountMinor: 7000, currency: "USD" } }], mandate, currentVersion: 2, requestedVersion: 2, variantId: "variant-1", authority: "absent" }),
    /blocked by the current mandate/i
  );
});

test("agent cannot replace a proposal while one-use authority is live", () => {
  assert.throws(
    () => stageCandidate({ offers: [eligible], mandate, currentVersion: 2, requestedVersion: 2, variantId: "variant-1", authority: "live" }),
    /authority is live/i
  );
});
