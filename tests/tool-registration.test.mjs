import test from "node:test";
import assert from "node:assert/strict";
import { deferToolUnregistration } from "../lib/tool-registration.js";

test("successful tool execution unregisters only after its result can settle", () => {
  const controller = new AbortController();
  const queued = [];

  deferToolUnregistration(controller, (callback) => queued.push(callback));

  assert.equal(controller.signal.aborted, false);
  assert.equal(queued.length, 1);

  queued[0]();
  assert.equal(controller.signal.aborted, true);
});

test("deferred unregistration tolerates an absent registration", () => {
  assert.doesNotThrow(() => deferToolUnregistration(null, () => {
    throw new Error("must not schedule");
  }));
});
