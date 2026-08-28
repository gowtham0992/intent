import { createSingleUseGrant, validateGoal } from "./policy.js";

const brief = Object.freeze({ query: "65W USB-C charger for my MacBook", budget: 60, country: "US" });
const scope = Object.freeze({ leaseId: "9db727ff-9708-4afa-a31d-d55b688289e5", productId: "gid://shopify/p/abc", variantId: "gid://shopify/ProductVariant/123456789", amountMinor: 2999, currency: "USD", quantity: 1, country: "US", maxAmountMinor: 6000, minimumRating: 4.5, minimumReviews: 100 });
function throws(action, pattern) { try { action(); return false; } catch (error) { return pattern.test(error.message); } }
function grant(options = {}) { return createSingleUseGrant({ ...scope, now: 100, ...options }); }

const cases = Object.freeze([
  ["E01", "Brief", "Natural-language shopping goal validates", () => validateGoal(brief).query === brief.query],
  ["E02", "Brief", "Only three discovery facts are needed", () => Object.keys(validateGoal(brief)).length === 3],
  ["E03", "Privacy", "Email cannot enter the discovery request", () => throws(() => validateGoal({ ...brief, email: "x@y.com" }), /unsupported/)],
  ["E04", "Boundary", "Zero budget is rejected", () => throws(() => validateGoal({ ...brief, budget: 0 }), /Budget/)],
  ["E05", "Boundary", "Invalid market is rejected", () => throws(() => validateGoal({ ...brief, country: "USA" }), /Country/)],
  ["E06", "Identity", "Fake product identifiers are rejected", () => throws(() => createSingleUseGrant({ ...scope, productId: "fake" }), /product/)],
  ["E07", "Identity", "Fake variant identifiers are rejected", () => throws(() => createSingleUseGrant({ ...scope, variantId: "fake" }), /variant/)],
  ["E08", "Money", "Price is frozen in integer minor units", () => throws(() => grant().consume({ ...scope, amountMinor: 3000 }, 200), /scope mismatch/)],
  ["E09", "Money", "Currency cannot change after approval", () => throws(() => grant().consume({ ...scope, currency: "EUR" }, 200), /scope mismatch/)],
  ["E10", "Authority", "The exact approved offer can consume the grant", () => grant().consume(scope, 200).variantId === scope.variantId],
  ["E11", "Authority", "Consumed authority cannot be replayed", () => { const value = grant(); value.consume(scope, 200); return throws(() => value.consume(scope, 300), /already used/); }],
  ["E12", "Authority", "Expired authority cannot be used", () => throws(() => grant({ ttlMs: 1_000 }).consume(scope, 1_101), /expired/)],
  ["E13", "Authority", "Quantity escalation is rejected", () => throws(() => createSingleUseGrant({ ...scope, quantity: 2 }), /one item/)],
  ["E14", "Authority", "Unexpected checkout fields are rejected", () => throws(() => grant().consume({ ...scope, coupon: "FREE" }, 200), /scope mismatch/)]
]);

export function runEvaluations() { return cases.map(([id, category, name, run]) => { try { return Object.freeze({ id, category, name, passed: run() === true }); } catch { return Object.freeze({ id, category, name, passed: false }); } }); }
