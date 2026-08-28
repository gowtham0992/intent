import test from "node:test";
import assert from "node:assert/strict";
import { createToolReadback } from "../lib/tool-readback.js";

test("mutation read-back reports one canonical mandate and authority state", () => {
  const authority = Object.freeze({ state: "live", reason: "human_granted" });
  const readback = createToolReadback({ mandateVersion: 3, authority });

  assert.deepEqual(readback, {
    mandateVersion: 3,
    authorityState: "live",
    reason: "human_granted"
  });
  assert.equal(Object.isFrozen(readback), true);
});

test("mutation read-back rejects incomplete or contradictory state", () => {
  assert.throws(() => createToolReadback({ mandateVersion: 0, authority: { state: "live", reason: "human_granted" } }), /mandate/i);
  assert.throws(() => createToolReadback({ mandateVersion: 1, authority: { state: "unknown", reason: "human_granted" } }), /authority state/i);
  assert.throws(() => createToolReadback({ mandateVersion: 1, authority: { state: "live", reason: "" } }), /reason/i);
});
