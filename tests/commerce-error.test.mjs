import test from "node:test";
import assert from "node:assert/strict";
import { commerceErrorFromResponse } from "../lib/commerce-error.js";

test("commerce response errors preserve public denial codes for the capability ledger", () => {
  const error = commerceErrorFromResponse({ error: { code: "PRICE_CHANGED", message: "The approved price changed." } }, 409);
  assert.equal(error.message, "The approved price changed.");
  assert.equal(error.code, "PRICE_CHANGED");
  assert.equal(error.status, 409);
});

test("commerce response errors mask unknown codes and bound untrusted messages", () => {
  const error = commerceErrorFromResponse({ error: { code: "INTERNAL_DATABASE_SECRET", message: "x".repeat(600) } }, 500);
  assert.equal(error.code, "EXECUTION_REJECTED");
  assert.equal(error.message.length, 240);

  const malformed = commerceErrorFromResponse({ error: { message: { nested: true } } }, 502);
  assert.equal(malformed.message, "The commerce rail failed.");
  assert.equal(malformed.code, "EXECUTION_REJECTED");
});

