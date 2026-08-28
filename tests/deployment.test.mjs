import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production surface uses an injected exact commerce origin without an iframe broker", async () => {
  const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const build = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(app, /127\.0\.0\.1/);
  assert.match(html, /<script src="\/config\.js"><\/script>/);
  assert.doesNotMatch(html, /<iframe/);
  assert.doesNotMatch(app, /vaultOrigin|discloseThroughVault/);
  assert.doesNotMatch(app, /modelContext\?\.executeTool|modelContext\?\.getTools/);
  assert.match(app, /const ACTION_TOOL = "intent_open_approved_checkout_once"/);
  assert.match(app, /name:"intent_stage_candidate_for_approval"/);
  assert.match(app, /state\.staged\?\.mandateVersion!==state\.mandateVersion/);
  assert.match(app, /WebMCP agent connected/);
  assert.match(app, /Browsing mode/);
  assert.match(app, /Open Intent in a WebMCP-enabled client to collaborate with your agent\./);
  assert.match(html, /Human-governed agentic commerce · live/);
  assert.doesNotMatch(html, /Universal agentic commerce|impossible to quietly exceed/i);
  assert.doesNotMatch(build, /INTENT_VAULT_ORIGIN/);
});

test("production hosts allowlist only the exact app and commerce origins", async () => {
  const commerce = await readFile(new URL("../wrangler.commerce.jsonc", import.meta.url), "utf8");
  const vercel = await readFile(new URL("../vercel.json", import.meta.url), "utf8");
  assert.match(commerce, /https:\/\/intent-lime-five\.vercel\.app/);
  assert.match(commerce, /\.well-known\/ucp/);
  assert.match(vercel, /https:\/\/intent-commerce\.gowtham0992\.workers\.dev/);
  assert.doesNotMatch(vercel, /intent-vault/);
  assert.doesNotMatch(`${commerce}\n${vercel}`, /http:\/\//);
});
