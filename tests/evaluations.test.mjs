import test from "node:test";
import assert from "node:assert/strict";
import { runEvaluations } from "../lib/evaluations.js";

test("boundary evaluation matrix contains 14 passing cases", () => {
  const results = runEvaluations();
  assert.equal(results.length, 14);
  assert.deepEqual(results.filter(({ passed }) => !passed), []);
});
