import assert from "node:assert/strict";
import test from "node:test";
import { createApprovalHandshake } from "../lib/approval-handshake.js";

test("approval handshake resolves exactly once with the human decision", async () => {
  const handshake = createApprovalHandshake();

  assert.equal(handshake.settle({ outcome: "granted", leaseId: "lease_123" }), true);
  assert.equal(handshake.settle({ outcome: "declined" }), false);
  assert.deepEqual(await handshake.promise, { outcome: "granted", leaseId: "lease_123" });
  assert.equal(handshake.settled, true);
});

test("approval handshake releases a waiting tool call when its client aborts", async () => {
  const controller = new AbortController();
  const handshake = createApprovalHandshake({ signal: controller.signal });

  controller.abort();

  assert.deepEqual(await handshake.promise, {
    outcome: "client_cancelled",
    detail: "The agent stopped waiting before the human decided."
  });
  assert.equal(handshake.settle({ outcome: "granted" }), false);
});

test("an already-aborted signal cannot leave a tool call pending", async () => {
  const controller = new AbortController();
  controller.abort();

  const handshake = createApprovalHandshake({ signal: controller.signal });

  assert.equal((await handshake.promise).outcome, "client_cancelled");
});
