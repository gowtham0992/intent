import test from "node:test";
import assert from "node:assert/strict";
import { appendActivity } from "../lib/activity.js";

test("collaboration history preserves actor, order, and mandate provenance", () => {
  let history = [];
  history = appendActivity(history, { actor: "agent", title: "Proposed mandate v1", detail: "4 eligible · 2 blocked" });
  history = appendActivity(history, { actor: "you", title: "Changed mandate to v2", detail: "Minimum reviews · 500" });
  history = appendActivity(history, { actor: "intent", title: "Invalidated proposal", detail: "Agent proposal belonged to v1" });

  assert.deepEqual(history.map(({ sequence, actor, title }) => ({ sequence, actor, title })), [
    { sequence: 1, actor: "agent", title: "Proposed mandate v1" },
    { sequence: 2, actor: "you", title: "Changed mandate to v2" },
    { sequence: 3, actor: "intent", title: "Invalidated proposal" }
  ]);
  assert.equal(Object.isFrozen(history), true);
  assert.equal(Object.isFrozen(history[0]), true);
});

test("collaboration history rejects ambiguous authors and bounds long sessions", () => {
  assert.throws(() => appendActivity([], { actor: "merchant", title: "Changed mandate", detail: "No" }), /actor/i);

  let history = [];
  for (let index = 1; index <= 10; index += 1) {
    history = appendActivity(history, { actor: "intent", title: `Event ${index}`, detail: "Observed" });
  }
  assert.equal(history.length, 8);
  assert.equal(history[0].title, "Event 3");
  assert.equal(history.at(-1).sequence, 10);
});

test("merchant-supplied labels are bounded without breaking the product flow", () => {
  const history = appendActivity([], { actor: "agent", title: `Staged ${"x".repeat(180)}`, detail: "Observed" });
  assert.equal(history[0].title.length, 100);
  assert.match(history[0].title, /^Staged x+/);
});

test("agent activity can expose validated WebMCP tool provenance", () => {
  const history = appendActivity([], {
    actor: "agent",
    title: "Staged Anker",
    detail: "Mandate v2",
    tool: "intent_stage_candidate_for_approval"
  });

  assert.equal(history[0].tool, "intent_stage_candidate_for_approval");
  assert.throws(
    () => appendActivity([], { actor: "agent", title: "Bad", detail: "Observed", tool: "<script>" }),
    /tool/i
  );
});
