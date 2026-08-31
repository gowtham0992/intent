import test from "node:test";
import assert from "node:assert/strict";
import { createSingleUseGrant, validateGoal } from "../lib/policy.js";

const goal = { query: "65W USB-C charger for my MacBook", budget: 60, country: "US" };
const scope = { leaseId: "9db727ff-9708-4afa-a31d-d55b688289e5", productId: "gid://shopify/p/abc", variantId: "gid://shopify/ProductVariant/123456789", amountMinor: 2999, currency: "USD", quantity: 1, country: "US", maxAmountMinor: 6000, minimumRating: 4.5, minimumReviews: 100 };

test("shopping brief accepts only the facts needed for public discovery", () => {
  assert.deepEqual(validateGoal(goal), goal);
  assert.deepEqual(validateGoal({ query: goal.query, budget: goal.budget }), { ...goal, country: "US" });
  assert.throws(() => validateGoal({ ...goal, email: "private@example.com" }), /unsupported field/);
  assert.throws(() => validateGoal({ ...goal, budget: 0 }), /Budget/);
});

test("checkout grant is exact-scope, expiring, and single-use", () => {
  const grant = createSingleUseGrant({ ...scope, ttlMs: 10_000, now: 100 });
  assert.throws(() => grant.consume({ ...scope, amountMinor: 3000 }, 200), /scope mismatch/);
  assert.deepEqual(grant.consume(scope, 200), scope);
  assert.throws(() => grant.consume(scope, 300), /already used/);
  const expired = createSingleUseGrant({ ...scope, ttlMs: 1_000, now: 100 });
  assert.throws(() => expired.consume(scope, 1_101), /expired/);
});

test("grant rejects fake identities and broader cart authority", () => {
  assert.throws(() => createSingleUseGrant({ ...scope, leaseId: "fake" }), /lease ID/);
  assert.throws(() => createSingleUseGrant({ ...scope, variantId: "fake" }), /variant/);
  assert.throws(() => createSingleUseGrant({ ...scope, quantity: 2 }), /one item/);
  const grant = createSingleUseGrant(scope);
  assert.throws(() => grant.consume({ ...scope, coupon: "FREE" }), /scope mismatch/);
});
