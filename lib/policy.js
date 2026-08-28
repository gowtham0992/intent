const PRODUCT_ID = /^gid:\/\/shopify\/(?:p\/[A-Za-z0-9]+|Product\/\d+)$/;
const VARIANT_ID = /^gid:\/\/shopify\/ProductVariant\/\d+$/;
const LEASE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value, label, min, max) {
  if (typeof value !== "string") throw new TypeError(`${label} must be text.`);
  const clean = value.trim();
  if (clean.length < min || clean.length > max || /[\u0000-\u001f\u007f]/.test(clean)) throw new TypeError(`${label} must contain ${min}–${max} safe characters.`);
  return clean;
}

export function validateGoal(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Shopping brief must be an object.");
  const allowed = new Set(["query", "budget", "country"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new TypeError("Shopping brief contains an unsupported field.");
  if (typeof input.budget !== "number" || !Number.isFinite(input.budget) || input.budget < 1 || input.budget > 10_000) throw new TypeError("Budget must be between 1 and 10,000 USD.");
  const country = text(input.country ?? "US", "Country", 2, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new TypeError("Country must be a two-letter code.");
  return Object.freeze({ query: text(input.query, "Query", 8, 240), budget: Math.round(input.budget * 100) / 100, country });
}

export function createSingleUseGrant({ leaseId, productId, variantId, amountMinor, currency, quantity = 1, country = "US", maxAmountMinor, minimumRating, minimumReviews, ttlMs = 60_000, now = Date.now() }) {
  if (!LEASE_ID.test(leaseId ?? "")) throw new TypeError("Invalid capability lease ID.");
  if (!PRODUCT_ID.test(productId ?? "")) throw new TypeError("Invalid UCP product ID.");
  if (!VARIANT_ID.test(variantId ?? "")) throw new TypeError("Invalid Shopify variant ID.");
  if (!Number.isInteger(amountMinor) || amountMinor < 1 || amountMinor > 1_000_000) throw new TypeError("Invalid minor-unit amount.");
  if (!/^[A-Z]{3}$/.test(currency ?? "")) throw new TypeError("Invalid currency code.");
  if (quantity !== 1) throw new TypeError("Checkout handoffs currently support one item.");
  if (!/^[A-Z]{2}$/.test(country)) throw new TypeError("Invalid country code.");
  if (!Number.isInteger(maxAmountMinor) || maxAmountMinor < amountMinor || maxAmountMinor > 1_000_000) throw new TypeError("Invalid mandate budget.");
  if (typeof minimumRating !== "number" || !Number.isFinite(minimumRating) || minimumRating < 0 || minimumRating > 5) throw new TypeError("Invalid mandate rating.");
  if (!Number.isInteger(minimumReviews) || minimumReviews < 0 || minimumReviews > 1_000_000) throw new TypeError("Invalid mandate review count.");
  if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 60_000) throw new TypeError("Invalid grant lifetime.");
  const scope = Object.freeze({ leaseId, productId, variantId, amountMinor, currency, quantity, country, maxAmountMinor, minimumRating, minimumReviews });
  const expiresAt = now + ttlMs;
  let used = false;
  return Object.freeze({
    expiresAt,
    consume(input, at = Date.now()) {
      if (used) throw new Error("Grant already used.");
      if (at > expiresAt) throw new Error("Grant expired.");
      if (!input || Object.keys(scope).some((key) => input[key] !== scope[key]) || Object.keys(input).some((key) => !(key in scope))) throw new Error("Grant scope mismatch.");
      used = true;
      return scope;
    }
  });
}
