import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITY_REASONS,
  capabilityReasonForExecutionError,
  createCapabilityLedger,
  normalizeCommerceErrorCode,
  snapshotCapability,
  transitionCapability
} from "../lib/capability-state.js";

const TOOL = "intent_open_approved_checkout_once";

test("capability ledger explains the complete absent-live-consumed lifecycle", () => {
  let ledger = createCapabilityLedger(TOOL);
  ledger = transitionCapability(ledger, {
    state: "absent",
    reason: CAPABILITY_REASONS.AGENT_STAGING_REQUIRED,
    actor: "agent",
    mandateVersion: 1
  });
  ledger = transitionCapability(ledger, {
    state: "absent",
    reason: CAPABILITY_REASONS.HUMAN_GRANT_REQUIRED,
    actor: "agent",
    mandateVersion: 1
  });
  ledger = transitionCapability(ledger, {
    state: "live",
    reason: CAPABILITY_REASONS.HUMAN_GRANTED,
    actor: "human",
    mandateVersion: 1
  });
  ledger = transitionCapability(ledger, {
    state: "used",
    reason: CAPABILITY_REASONS.CONSUMED,
    actor: "agent",
    mandateVersion: 1
  });

  const snapshot = snapshotCapability(ledger);
  assert.equal(snapshot.tool, TOOL);
  assert.equal(snapshot.state, "used");
  assert.equal(snapshot.reason, "consumed");
  assert.equal(snapshot.available, false);
  assert.equal(snapshot.replayable, false);
  assert.deepEqual(snapshot.nextStep, { actor: "human", action: "start_new_authorization" });
  assert.deepEqual(snapshot.history.map(({ sequence, state, reason }) => ({ sequence, state, reason })), [
    { sequence: 1, state: "absent", reason: "mandate_required" },
    { sequence: 2, state: "absent", reason: "agent_staging_required" },
    { sequence: 3, state: "absent", reason: "human_grant_required" },
    { sequence: 4, state: "live", reason: "human_granted" },
    { sequence: 5, state: "used", reason: "consumed" }
  ]);
  assert.equal(snapshot.trust, "page_asserted_transparency");
  assert.equal(Object.isFrozen(ledger), true);
  assert.equal(Object.isFrozen(ledger.history), true);
  assert.equal(Object.isFrozen(ledger.history[0]), true);
});

test("capability ledger preserves a public server revalidation code without leaking arbitrary values", () => {
  let ledger = createCapabilityLedger(TOOL);
  ledger = transitionCapability(ledger, {
    state: "used",
    reason: CAPABILITY_REASONS.REJECTED_BY_REVALIDATION,
    actor: "server",
    mandateVersion: 3,
    errorCode: "PRICE_CHANGED"
  });

  const snapshot = snapshotCapability(ledger);
  assert.equal(snapshot.reason, "rejected_by_revalidation");
  assert.equal(snapshot.errorCode, "PRICE_CHANGED");
  assert.deepEqual(snapshot.nextStep, { actor: "human", action: "review_live_offer_again" });
  assert.equal(normalizeCommerceErrorCode("LEASE_SCOPE_MISMATCH"), "LEASE_SCOPE_MISMATCH");
  assert.equal(capabilityReasonForExecutionError("PRICE_CHANGED"), CAPABILITY_REASONS.REJECTED_BY_REVALIDATION);
  assert.equal(capabilityReasonForExecutionError("LEASE_EXPIRED"), CAPABILITY_REASONS.EXPIRED_UNUSED);
  assert.equal(capabilityReasonForExecutionError("LEASE_SCOPE_MISMATCH"), CAPABILITY_REASONS.EXECUTION_FAILED_CLOSED);
  assert.equal(normalizeCommerceErrorCode("merchant-secret-error"), "EXECUTION_REJECTED");
  assert.equal(normalizeCommerceErrorCode(null), "EXECUTION_REJECTED");
});

test("capability ledger validates transitions and remains bounded", () => {
  let ledger = createCapabilityLedger(TOOL);
  assert.throws(
    () => transitionCapability(ledger, { state: "live", reason: "made_up", actor: "human", mandateVersion: 1 }),
    /reason/i
  );
  assert.throws(
    () => transitionCapability(ledger, { state: "live", reason: CAPABILITY_REASONS.HUMAN_GRANTED, actor: "merchant", mandateVersion: 1 }),
    /actor/i
  );

  for (let version = 1; version <= 15; version += 1) {
    ledger = transitionCapability(ledger, {
      state: "absent",
      reason: CAPABILITY_REASONS.INVALIDATED_BY_MANDATE_VERSION,
      actor: "human",
      mandateVersion: version
    });
  }
  assert.equal(ledger.history.length, 12);
  assert.equal(ledger.history.at(-1).sequence, 16);
  assert.equal(ledger.history.at(-1).mandateVersion, 15);
});
