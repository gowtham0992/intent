import test from "node:test";
import assert from "node:assert/strict";
import { createMandate, evaluateOffer, validateMandate } from "../lib/mandate.js";

const goal = { query: "65W charger for a MacBook", budget: 60, country: "US" };
const offer = { available: true, price: { amountMinor: 2999, currency: "USD" }, rating: { value: 4.8, count: 459 } };

test("a shopping goal compiles into a bounded purchase mandate", () => {
  assert.deepEqual(createMandate(goal, { minimumRating: 4.5, minimumReviews: 100 }), {
    maxAmountMinor: 6000, currency: "USD", minimumRating: 4.5, minimumReviews: 100
  });
  assert.throws(() => validateMandate({ maxAmountMinor: 6000, currency: "USD", minimumRating: 6, minimumReviews: 0 }), /rating/i);
});

test("unspecified reputation thresholds remain optional rather than invented", () => {
  assert.deepEqual(createMandate(goal), {
    maxAmountMinor: 6000, currency: "USD", minimumRating: 0, minimumReviews: 0
  });
});

test("offer evaluation explains every pass and block deterministically", () => {
  const mandate = createMandate(goal, { minimumRating: 4.5, minimumReviews: 100 });
  const accepted = evaluateOffer(offer, mandate);
  assert.equal(accepted.eligible, true);
  assert.equal(accepted.checks.length, 5);
  const expensive = evaluateOffer({ ...offer, price: { amountMinor: 7000, currency: "USD" } }, mandate);
  assert.equal(expensive.eligible, false);
  assert.match(expensive.reasons.join(" "), /budget/i);
});

test("blocked decisions expose exact numeric deltas to the agent", () => {
  const mandate = createMandate(goal, { minimumRating: 4.8, minimumReviews: 500 });
  const decision = evaluateOffer({ ...offer, price: { amountMinor: 6500, currency: "USD" }, rating: { value: 4.4, count: 28 } }, mandate);
  assert.equal(decision.eligible, false);
  assert.match(decision.reasons.join(" "), /over hard budget by \$5\.00/i);
  assert.match(decision.reasons.join(" "), /rating is 0\.4 below/i);
  assert.match(decision.reasons.join(" "), /review count is 472 below/i);
});

test("unknown currency and missing reputation evidence fail closed", () => {
  const mandate = createMandate(goal, { minimumRating: 4, minimumReviews: 20 });
  assert.equal(evaluateOffer({ ...offer, price: { amountMinor: 2999, currency: "AUD" } }, mandate).eligible, false);
  const missing = evaluateOffer({ ...offer, rating: null }, mandate);
  assert.equal(missing.eligible, false);
  assert.match(missing.reasons.join(" "), /rating evidence/i);
});
