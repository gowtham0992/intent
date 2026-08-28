const MAX_TRANSITIONS = 12;
const STATES = new Set(["absent", "live", "used", "expired"]);
const ACTORS = new Set(["human", "agent", "intent", "server"]);

export const CAPABILITY_REASONS = Object.freeze({
  MANDATE_REQUIRED: "mandate_required",
  AGENT_STAGING_REQUIRED: "agent_staging_required",
  HUMAN_GRANT_REQUIRED: "human_grant_required",
  HUMAN_GRANTED: "human_granted",
  CONSUMED: "consumed",
  EXPIRED_UNUSED: "expired_unused",
  REVOKED_BY_HUMAN: "revoked_by_human",
  INVALIDATED_BY_MANDATE_VERSION: "invalidated_by_mandate_version",
  REJECTED_BY_REVALIDATION: "rejected_by_revalidation",
  LEASE_ISSUANCE_FAILED: "lease_issuance_failed",
  EXECUTION_FAILED_CLOSED: "execution_failed_closed"
});

const REASON_STATE = new Map([
  [CAPABILITY_REASONS.MANDATE_REQUIRED, "absent"],
  [CAPABILITY_REASONS.AGENT_STAGING_REQUIRED, "absent"],
  [CAPABILITY_REASONS.HUMAN_GRANT_REQUIRED, "absent"],
  [CAPABILITY_REASONS.HUMAN_GRANTED, "live"],
  [CAPABILITY_REASONS.CONSUMED, "used"],
  [CAPABILITY_REASONS.EXPIRED_UNUSED, "expired"],
  [CAPABILITY_REASONS.REVOKED_BY_HUMAN, "absent"],
  [CAPABILITY_REASONS.INVALIDATED_BY_MANDATE_VERSION, "absent"],
  [CAPABILITY_REASONS.REJECTED_BY_REVALIDATION, "used"],
  [CAPABILITY_REASONS.LEASE_ISSUANCE_FAILED, "absent"],
  [CAPABILITY_REASONS.EXECUTION_FAILED_CLOSED, "used"]
]);

const NEXT_STEPS = Object.freeze({
  [CAPABILITY_REASONS.MANDATE_REQUIRED]: Object.freeze({ actor: "agent", action: "propose_purchase_mandate" }),
  [CAPABILITY_REASONS.AGENT_STAGING_REQUIRED]: Object.freeze({ actor: "agent", action: "compare_and_stage_current_mandate" }),
  [CAPABILITY_REASONS.HUMAN_GRANT_REQUIRED]: Object.freeze({ actor: "human", action: "review_and_grant_once" }),
  [CAPABILITY_REASONS.HUMAN_GRANTED]: Object.freeze({ actor: "agent", action: "execute_frozen_capability" }),
  [CAPABILITY_REASONS.CONSUMED]: Object.freeze({ actor: "human", action: "start_new_authorization" }),
  [CAPABILITY_REASONS.EXPIRED_UNUSED]: Object.freeze({ actor: "human", action: "grant_again_if_still_desired" }),
  [CAPABILITY_REASONS.REVOKED_BY_HUMAN]: Object.freeze({ actor: "human", action: "grant_again_if_still_desired" }),
  [CAPABILITY_REASONS.INVALIDATED_BY_MANDATE_VERSION]: Object.freeze({ actor: "agent", action: "compare_and_stage_current_mandate" }),
  [CAPABILITY_REASONS.REJECTED_BY_REVALIDATION]: Object.freeze({ actor: "human", action: "review_live_offer_again" }),
  [CAPABILITY_REASONS.LEASE_ISSUANCE_FAILED]: Object.freeze({ actor: "human", action: "retry_grant" }),
  [CAPABILITY_REASONS.EXECUTION_FAILED_CLOSED]: Object.freeze({ actor: "human", action: "review_before_retry" })
});

const PUBLIC_COMMERCE_ERROR_CODES = new Set([
  "PRICE_CHANGED",
  "OFFER_UNAVAILABLE",
  "OFFER_CHANGED",
  "MANDATE_MISMATCH",
  "LEASE_EXPIRED",
  "LEASE_UNKNOWN",
  "LEASE_REPLAYED",
  "LEASE_SCOPE_MISMATCH"
]);

function validateToolName(tool) {
  if (typeof tool !== "string" || !/^[a-z][a-z0-9_]{2,63}$/.test(tool)) throw new TypeError("Capability tool name is invalid.");
  return tool;
}

function validateMandateVersion(value) {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("Capability mandate version must be a positive integer.");
  return value;
}

export function normalizeCommerceErrorCode(value) {
  return PUBLIC_COMMERCE_ERROR_CODES.has(value) ? value : "EXECUTION_REJECTED";
}

export function capabilityReasonForExecutionError(value) {
  const code = normalizeCommerceErrorCode(value);
  if (code === "LEASE_EXPIRED") return CAPABILITY_REASONS.EXPIRED_UNUSED;
  if (["PRICE_CHANGED", "OFFER_UNAVAILABLE", "OFFER_CHANGED", "MANDATE_MISMATCH"].includes(code)) return CAPABILITY_REASONS.REJECTED_BY_REVALIDATION;
  return CAPABILITY_REASONS.EXECUTION_FAILED_CLOSED;
}

export function createCapabilityLedger(tool) {
  const empty = Object.freeze({ tool: validateToolName(tool), sequence: 0, history: Object.freeze([]) });
  return transitionCapability(empty, {
    state: "absent",
    reason: CAPABILITY_REASONS.MANDATE_REQUIRED,
    actor: "intent",
    mandateVersion: null
  });
}

export function transitionCapability(ledger, event) {
  if (!ledger || !Array.isArray(ledger.history)) throw new TypeError("Capability ledger is invalid.");
  if (!STATES.has(event?.state)) throw new TypeError("Capability state is invalid.");
  if (!REASON_STATE.has(event?.reason)) throw new TypeError("Capability reason is invalid.");
  if (REASON_STATE.get(event.reason) !== event.state) throw new TypeError("Capability reason does not match its state.");
  if (!ACTORS.has(event?.actor)) throw new TypeError("Capability actor is invalid.");

  const errorCode = event.errorCode === undefined ? undefined : normalizeCommerceErrorCode(event.errorCode);
  const entry = Object.freeze({
    sequence: ledger.sequence + 1,
    state: event.state,
    reason: event.reason,
    actor: event.actor,
    mandateVersion: validateMandateVersion(event.mandateVersion),
    ...(errorCode ? { errorCode } : {})
  });
  return Object.freeze({
    tool: validateToolName(ledger.tool),
    sequence: entry.sequence,
    history: Object.freeze([...ledger.history.slice(-(MAX_TRANSITIONS - 1)), entry])
  });
}

export function snapshotCapability(ledger) {
  if (!ledger || !Array.isArray(ledger.history) || ledger.history.length === 0) throw new TypeError("Capability ledger is empty.");
  const current = ledger.history.at(-1);
  return {
    tool: ledger.tool,
    state: current.state,
    reason: current.reason,
    actor: current.actor,
    mandateVersion: current.mandateVersion,
    available: current.state === "live",
    usesRemaining: current.state === "live" ? 1 : 0,
    replayable: false,
    humanGrantRequired: true,
    nextStep: NEXT_STEPS[current.reason],
    trust: "page_asserted_transparency",
    ...(current.errorCode ? { errorCode: current.errorCode } : {}),
    history: ledger.history
  };
}
