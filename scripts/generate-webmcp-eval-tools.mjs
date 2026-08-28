import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ACTION_TOOL } from "../lib/webmcp-tool-contracts.js";
import { createEvalToolDocuments } from "../evals/tool-fixtures.mjs";

const evalDirectory = fileURLToPath(new URL("../evals/", import.meta.url));
const { preApproval, granted } = createEvalToolDocuments();

await mkdir(evalDirectory, { recursive: true });
await Promise.all([
  writeFile(`${evalDirectory}/tools.pre-approval.json`, `${JSON.stringify(preApproval, null, 2)}\n`),
  writeFile(`${evalDirectory}/tools.granted.json`, `${JSON.stringify(granted, null, 2)}\n`)
]);

console.log(`Wrote ${preApproval.tools.length} pre-approval tools and ${granted.tools.length} granted-state tools (${ACTION_TOOL}).`);
