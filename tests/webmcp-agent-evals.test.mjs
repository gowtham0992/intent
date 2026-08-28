import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createEvalToolDocuments, grantedScope } from "../evals/tool-fixtures.mjs";

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

function flattenExpectedCalls(nodes) {
  if (nodes === null) return [];
  return nodes.flatMap((node) => {
    if ("functionName" in node) return [node];
    if ("ordered" in node) return flattenExpectedCalls(node.ordered);
    if ("unordered" in node) return flattenExpectedCalls(node.unordered);
    throw new TypeError("Unknown expectedCall node.");
  });
}

function assertSuiteContract(suite, availableTools) {
  assert.ok(Array.isArray(suite) && suite.length > 0);
  const names = new Set();
  const tools = new Map(availableTools.map((tool) => [tool.name, tool]));

  for (const entry of suite) {
    assert.equal(typeof entry.name, "string");
    assert.ok(entry.name.length > 8);
    assert.ok(!names.has(entry.name), `duplicate eval name: ${entry.name}`);
    names.add(entry.name);
    assert.ok(Array.isArray(entry.messages) && entry.messages.length > 0);

    for (const call of flattenExpectedCalls(entry.expectedCall)) {
      assert.ok(tools.has(call.functionName), `unknown eval tool: ${call.functionName}`);
      if (call.arguments !== undefined && call.arguments !== null) {
        const properties = tools.get(call.functionName).inputSchema.properties;
        for (const key of Object.keys(call.arguments)) {
          assert.ok(Object.hasOwn(properties, key), `${call.functionName} has no ${key} argument`);
        }
      }
    }
  }
}

test("committed WebMCP eval schemas are generated from the production tool contracts", async () => {
  const expected = createEvalToolDocuments();
  assert.deepEqual(await readJson("../evals/tools.pre-approval.json"), expected.preApproval);
  assert.deepEqual(await readJson("../evals/tools.granted.json"), expected.granted);

  for (const tool of [...expected.preApproval.tools, ...expected.granted.tools]) {
    assert.ok(tool.description.length > 40, `${tool.name} needs a decision-useful description`);
    for (const [name, property] of Object.entries(tool.inputSchema.properties)) {
      assert.ok(property.description?.length > 12, `${tool.name}.${name} needs a property description`);
    }
  }
});

test("agent evaluation suites reference only tools and arguments available in each lifecycle state", async () => {
  const tools = createEvalToolDocuments();
  const preApproval = await readJson("../evals/pre-approval.json");
  const granted = await readJson("../evals/granted-authority.json");
  assertSuiteContract(preApproval, tools.preApproval.tools);
  assertSuiteContract(granted, tools.granted.tools);
  assert.equal(preApproval.length, 9);
  assert.equal(granted.length, 3);
});

test("agent evaluations encode the authority boundary and exact frozen scope", async () => {
  const preApproval = await readJson("../evals/pre-approval.json");
  const granted = await readJson("../evals/granted-authority.json");
  const preApprovalCalls = preApproval.flatMap((entry) => flattenExpectedCalls(entry.expectedCall));
  assert.ok(!preApprovalCalls.some(({ functionName }) => functionName === "intent_open_approved_checkout_once"));
  const absentAuthorityCase = preApproval.find((entry) => entry.name.includes("absent authority"));
  assert.deepEqual(flattenExpectedCalls(absentAuthorityCase.expectedCall).map(({ functionName }) => functionName), [
    "intent_read_purchase_mandate",
    "intent_compare_candidates",
    "intent_stage_candidate_for_approval"
  ]);
  assert.ok(preApproval.some((entry) => entry.name.includes("no offer") && !flattenExpectedCalls(entry.expectedCall).some(({ functionName }) => functionName.includes("stage"))));

  const checkoutCall = granted.flatMap((entry) => flattenExpectedCalls(entry.expectedCall)).find(({ functionName }) => functionName === "intent_open_approved_checkout_once");
  assert.deepEqual(checkoutCall.arguments, { ...grantedScope, quantity: 1 });
  const wideningCase = granted.find((entry) => entry.name.includes("widen quantity"));
  assert.deepEqual(flattenExpectedCalls(wideningCase.expectedCall).map(({ functionName }) => functionName), ["intent_read_purchase_mandate"]);
});
