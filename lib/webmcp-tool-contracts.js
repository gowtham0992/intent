export const ACTION_TOOL = "intent_open_approved_checkout_once";

export const goalSchema = Object.freeze({
  type: "object",
  properties: {
    query: {
      type: "string",
      minLength: 8,
      maxLength: 240,
      description: "The physical product to find, including every hard requirement the user stated."
    },
    budget: {
      type: "number",
      minimum: 1,
      maximum: 10000,
      description: "The user's hard total price ceiling in the mandate currency."
    },
    country: {
      type: "string",
      pattern: "^[A-Z]{2}$",
      default: "US",
      description: "Two-letter destination country code; default to US only when the user did not specify one."
    },
    minimumRating: {
      type: "number",
      minimum: 0,
      maximum: 5,
      default: 0,
      description: "Hard minimum star rating, or 0 when the user did not specify one."
    },
    minimumReviews: {
      type: "integer",
      minimum: 0,
      maximum: 1000000,
      default: 0,
      description: "Hard minimum review count, or 0 when the user did not specify one."
    }
  },
  required: ["query", "budget"],
  additionalProperties: false
});

export const staticToolContracts = Object.freeze({
  propose: Object.freeze({
    name: "intent_propose_purchase_mandate",
    title: "Search products and propose mandate",
    description: "Searches the live product catalog for a physical-product query and explicit hard budget, creates a versioned purchase mandate with optional destination and reputation thresholds, and opens Intent's shared decision room. Returns normalized product details, eligibility evidence, source provenance, and canonical state readback. Checkout authority remains absent.",
    inputSchema: goalSchema,
    annotations: Object.freeze({ untrustedContentHint: true })
  }),
  compare: Object.freeze({
    name: "intent_compare_candidates",
    title: "Compare product candidates",
    description: "Evaluates every live product candidate against every deterministic rule in the current human-visible mandate. Returns normalized product details, an audit summary, and exact reasons each offer is eligible or blocked, then records the evaluation in the shared collaboration history.",
    inputSchema: Object.freeze({ type: "object", properties: Object.freeze({}), additionalProperties: false }),
    annotations: Object.freeze({ untrustedContentHint: true })
  }),
  read: Object.freeze({
    name: "intent_read_purchase_mandate",
    title: "Read purchase mandate",
    description: "Reads the current human-edited purchase mandate, selected product details, staged proposal, collaboration history, safe-resume and live-revalidation status, and the reason-coded lifecycle of checkout authority—including why the dynamic capability is absent and which actor owns the next step. Read-only; capability reasons are page-asserted transparency, not identity attestation.",
    inputSchema: Object.freeze({ type: "object", properties: Object.freeze({}), additionalProperties: false }),
    annotations: Object.freeze({ readOnlyHint: true, untrustedContentHint: true })
  }),
  stage: Object.freeze({
    name: "intent_stage_candidate_for_approval",
    title: "Stage candidate for approval",
    description: "Stages one eligible live candidate under the exact current mandate version, opens its human approval screen, and waits for the decision in the same tool call. Returns the human decision and canonical state readback. Approval makes a separate one-use checkout capability available; payment remains with the person and merchant.",
    inputSchema: Object.freeze({
      type: "object",
      properties: Object.freeze({
        variantId: Object.freeze({
          type: "string",
          minLength: 1,
          maxLength: 512,
          description: "The exact variantId of an eligible candidate returned by the current comparison."
        }),
        mandateVersion: Object.freeze({
          type: "integer",
          minimum: 1,
          description: "The current mandate version returned by Intent; earlier versions are stale after a human edit."
        })
      }),
      required: ["variantId", "mandateVersion"],
      additionalProperties: false
    }),
    annotations: Object.freeze({ untrustedContentHint: true })
  })
});

export function createCheckoutToolContract({ mandateVersion, title, seller, displayPrice, scope }) {
  return {
    name: ACTION_TOOL,
    title: "Open approved checkout once",
    description: `Executes human-approved mandate v${mandateVersion} once. Revalidates and returns the checkout for exactly 1 × ${title} from ${seller} at ${displayPrice}, within the frozen budget and reputation rules. Payment remains unsubmitted. Any changed product, merchant, price, quantity, destination, or mandate requires a separately approved capability.`,
    inputSchema: {
      type: "object",
      properties: {
        leaseId: { type: "string", enum: [scope.leaseId], description: "The exact server-issued one-use lease identifier." },
        productId: { type: "string", enum: [scope.productId], description: "The exact approved catalog product identifier." },
        variantId: { type: "string", enum: [scope.variantId], description: "The exact approved catalog variant identifier." },
        amountMinor: { type: "integer", enum: [scope.amountMinor], description: "The approved live price in minor currency units." },
        currency: { type: "string", enum: [scope.currency], description: "The approved ISO currency code." },
        quantity: { type: "integer", enum: [1], description: "The approved quantity; this capability permits exactly one item." },
        country: { type: "string", enum: [scope.country], description: "The approved destination country." },
        maxAmountMinor: { type: "integer", enum: [scope.maxAmountMinor], description: "The frozen mandate budget ceiling in minor units." },
        minimumRating: { type: "number", enum: [scope.minimumRating], description: "The frozen minimum star rating." },
        minimumReviews: { type: "integer", enum: [scope.minimumReviews], description: "The frozen minimum review count." }
      },
      required: ["leaseId", "productId", "variantId", "amountMinor", "currency", "quantity", "country", "maxAmountMinor", "minimumRating", "minimumReviews"],
      additionalProperties: false
    },
    annotations: { untrustedContentHint: true }
  };
}
