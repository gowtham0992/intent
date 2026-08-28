import assert from "node:assert/strict";
import test from "node:test";
import { appendActivity } from "../lib/activity.js";
import { RESUME_TTL_MS, createResumeSnapshot, parseResumeSnapshot } from "../lib/safe-resume.js";

const savedAt = Date.UTC(2026, 7, 28, 12, 0, 0);
const goal = { query: "100W three-port USB-C charger with foldable prongs", budget: 100, country: "US" };
const mandate = { maxAmountMinor: 10_000, currency: "USD", minimumRating: 4.5, minimumReviews: 200 };

function activity() {
  let history = [];
  history = appendActivity(history, { actor: "agent", title: "Proposed mandate v1", detail: "2 eligible · 4 blocked", tool: "intent_propose_purchase_mandate" });
  history = appendActivity(history, { actor: "you", title: "Changed mandate to v2", detail: "Reviews 100 → 200" });
  return history;
}

test("safe resume round-trips only durable decision context", () => {
  const snapshot = createResumeSnapshot({ goal, mandate, mandateVersion: 2, activity: activity(), savedAt });
  const restored = parseResumeSnapshot(JSON.stringify(snapshot), { now: savedAt + 60_000 });

  assert.deepEqual(restored.goal, goal);
  assert.deepEqual(restored.mandate, mandate);
  assert.equal(restored.mandateVersion, 2);
  assert.deepEqual(restored.activity.map(({ actor, title, tool }) => ({ actor, title, tool })), [
    { actor: "agent", title: "Proposed mandate v1", tool: "intent_propose_purchase_mandate" },
    { actor: "you", title: "Changed mandate to v2", tool: undefined }
  ]);
  assert.equal(Object.isFrozen(restored), true);
  assert.equal(Object.isFrozen(restored.activity), true);
});

test("safe resume cannot serialize offers, staged proposals, leases, or authority", () => {
  const serialized = JSON.stringify(createResumeSnapshot({
    goal,
    mandate,
    mandateVersion: 2,
    activity: activity(),
    savedAt,
    offers: [{ title: "stale" }],
    staged: { variantId: "stale" },
    leaseId: "secret",
    authority: "live"
  }));

  assert.doesNotMatch(serialized, /offers|staged|lease|authority|variantId|productId/i);
});

test("safe resume rejects expired, malformed, and widened browser storage", () => {
  const valid = createResumeSnapshot({ goal, mandate, mandateVersion: 2, activity: activity(), savedAt });
  assert.throws(() => parseResumeSnapshot(JSON.stringify(valid), { now: savedAt + RESUME_TTL_MS + 1 }), /expired/i);
  assert.throws(() => parseResumeSnapshot("not-json", { now: savedAt }), /JSON/i);
  assert.throws(() => parseResumeSnapshot(JSON.stringify({ ...valid, authority: "live" }), { now: savedAt }), /unsupported/i);
  assert.throws(() => parseResumeSnapshot(JSON.stringify({ ...valid, mandateVersion: 0 }), { now: savedAt }), /version/i);
  assert.throws(() => parseResumeSnapshot(JSON.stringify({ ...valid, goal: { ...goal, budget: 1_000_000 } }), { now: savedAt }), /budget/i);
});
