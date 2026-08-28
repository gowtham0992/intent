import test from "node:test";
import assert from "node:assert/strict";
import { summarizeComparison } from "../lib/comparison.js";

const decision = (eligible, checkCount = 5) => ({
  eligible,
  checks: Array.from({ length: checkCount }, (_, index) => ({ code: `rule-${index}`, passed: eligible }))
});

test("comparison audit counts candidates and deterministic rule checks under one mandate version", () => {
  const audit = summarizeComparison([decision(true), decision(false), decision(true)], 2);

  assert.deepEqual(audit, {
    mandateVersion: 2,
    candidateCount: 3,
    checkCount: 15,
    eligibleCount: 2,
    blockedCount: 1
  });
  assert.equal(Object.isFrozen(audit), true);
});

test("comparison audit rejects malformed decisions and mandate versions", () => {
  assert.throws(() => summarizeComparison([], 0), /mandate version/i);
  assert.throws(() => summarizeComparison([{ eligible: true }], 1), /checks/i);
  assert.throws(() => summarizeComparison([decision("yes")], 1), /decision/i);
});
