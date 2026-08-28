import assert from "node:assert/strict";
import test from "node:test";
import { PurchaseLease } from "../cloudflare/commerce-worker.mjs";
import { createLocalDurableObjectBinding } from "../lib/local-durable-object-binding.mjs";

test("local Durable Object binding preserves atomic one-use lease semantics", async () => {
  const binding = createLocalDurableObjectBinding(PurchaseLease);
  const lease = binding.get(binding.idFromName("lease-1"));
  const scope = { productId: "p", amountMinor: 6999 };

  const issued = await lease.fetch("https://lease.internal/issue", {
    method: "POST",
    body: JSON.stringify({ scope, expiresAt: Date.now() + 60_000, used: false })
  });
  assert.equal(issued.status, 200);

  const attempts = await Promise.all([
    lease.fetch("https://lease.internal/consume", { method: "POST", body: JSON.stringify({ scope }) }),
    lease.fetch("https://lease.internal/consume", { method: "POST", body: JSON.stringify({ scope }) })
  ]);
  assert.deepEqual(attempts.map(({ status }) => status).sort(), [200, 409]);
  assert.equal((await attempts.find(({ status }) => status === 409).json()).code, "LEASE_REPLAYED");
});
