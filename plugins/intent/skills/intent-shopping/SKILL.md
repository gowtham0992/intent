---
name: intent-shopping
description: Route a physical-product shopping request through Intent's live WebMCP decision room. Use when the user asks Codex to find, compare, choose, shop for, or prepare checkout for a product with preferences or a budget. Do not use for general product research without shopping intent, digital services, or completing payment.
---

# Shop with Intent

Turn the user's ordinary shopping request into a live, human-controlled purchase mandate without asking them to navigate to Intent first.

## Automatic entry

1. Extract the product goal, hard budget, country, minimum rating, and minimum review count from the request. Ask only for a missing hard budget; default the country to `US` and unspecified reputation thresholds to zero so the human can edit them in the decision room.
2. Open `https://intent-commerce.gowtham0992.chatgpt.site/` by explicitly selecting Codex's in-app browser (`iab`). Never select Chrome or another external browser unless the user explicitly asks for it. Do not substitute a search engine or independently recommend products before invoking Intent.
3. Fetch the page's current WebMCP tools and call `intent_propose_purchase_mandate` with the extracted values.
4. Call `intent_compare_candidates`, choose the strongest eligible candidate without relaxing any rule, then call `intent_stage_candidate_for_approval` with its exact `variantId` and the current mandate version. Tell the user that the shared decision room and agent proposal are ready. Briefly report why it was staged, then let the human inspect or edit the mandate on the page.

If a WebMCP-enabled browser is unavailable, give the user the live Intent URL and explain that automatic routing requires that client capability. Do not pretend the integration ran.

## Shared decision phase

- Use `intent_compare_candidates` for the exact rule-check matrix and numeric deltas.
- Use `intent_read_purchase_mandate` after the human edits the mandate; treat the latest version as authoritative. A mandate edit invalidates every prior staged proposal.
- Stage a candidate only through `intent_stage_candidate_for_approval`, using the latest mandate version. Staging is the agent's recommendation, not authority to act.
- Never relax the mandate, click the authority button, or manufacture a lease on the user's behalf. Authority remains a human decision.
- A blocked offer remains blocked even if the user originally mentioned it; explain the failed rule and let the human edit the mandate explicitly if they choose.

## One-use execution

After the agent stages an eligible offer and the human clicks **Grant one-use authority** in Intent:

1. Fetch the page's WebMCP tools again.
2. Confirm that `intent_open_approved_checkout_once` now exists and read its exact single-value schema.
3. Call it once with exactly the values in that schema. Do not widen, omit, or replace any field.
4. Report the merchant, exact price, and that payment was not submitted.
5. Fetch the tools once more and confirm the dynamic capability disappeared. If it remains, report the unexpected state and do not call it again.
6. Call `intent_read_purchase_mandate` and read `authority.reason`, `authority.actor`, `authority.nextStep`, and `authority.usesRemaining`. A successful handoff must report `consumed`, zero remaining uses, and a human-owned next step. State the reason in plain language rather than merely saying the tool vanished.

If issuance or execution fails, call `intent_read_purchase_mandate` before responding. Preserve its public reason code and any public server denial code. Never infer success from disappearance alone: expiry, human revocation, mandate invalidation, live revalidation failure, and fail-closed execution are distinct terminal states.

The merchant URL is a checkout handoff, not permission to purchase. Never enter shipping details, payment information, or place an order without a separate, explicit user instruction and any confirmation required by the client.

## Trust boundary

Intent's page gates authority on a human click. Its server enforces the resulting exact scope, one-use consumption, expiry, and live UCP revalidation. The reason-coded lifecycle is page-asserted transparency, not identity attestation. Do not claim that the server cryptographically proves a person's identity or that a merchant verifies the mandate.
