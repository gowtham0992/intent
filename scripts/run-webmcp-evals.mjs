import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const suites = {
  "pre-approval": {
    tools: "evals/tools.pre-approval.json",
    evals: "evals/pre-approval.json",
    freeTierPaceMs: 15_000
  },
  granted: {
    tools: "evals/tools.granted.json",
    evals: "evals/granted-authority.json",
    freeTierPaceMs: 0
  }
};

const selected = process.argv[2];
if (!Object.hasOwn(suites, selected)) {
  console.error(`Choose one eval suite: ${Object.keys(suites).join(" or ")}.`);
  process.exit(2);
}

const suite = suites[selected];
const model = process.env.WEBMCP_EVAL_MODEL || "gemini-3.1-flash-lite";
const configuredPace = process.env.WEBMCP_EVAL_PACE_MS;
const paceMs = configuredPace === undefined ? suite.freeTierPaceMs : Number(configuredPace);
if (!Number.isInteger(paceMs) || paceMs < 0 || paceMs > 60_000) {
  console.error("WEBMCP_EVAL_PACE_MS must be an integer from 0 through 60000.");
  process.exit(2);
}

const root = fileURLToPath(new URL("../", import.meta.url));
const reportDirectory = `${root}.evals`;
const cli = `${root}node_modules/webmcp-evals/dist/bin/webmcp-evals.js`;
await mkdir(reportDirectory, { recursive: true });

async function latestReportAfter(startedAt) {
  const candidates = (await readdir(reportDirectory))
    .filter((name) => /^report-\d+\.json$/.test(name))
    .map((name) => `${reportDirectory}/${name}`);
  const reports = await Promise.all(candidates.map(async (path) => ({ path, modifiedAt: (await stat(path)).mtimeMs })));
  const latest = reports.filter(({ modifiedAt }) => modifiedAt >= startedAt - 1_000).sort((a, b) => b.modifiedAt - a.modifiedAt)[0];
  if (!latest) throw new Error("WebMCP evaluator exited without writing a current JSON report.");
  return JSON.parse(await readFile(latest.path, "utf8"));
}

async function runEvaluator(evalsPath) {
  const startedAt = Date.now();
  const child = spawn(process.execPath, [
    cli,
    "--model", model,
    "local",
    "-t", suite.tools,
    "-e", evalsPath,
    "--reporter", "console", "html", "json"
  ], { cwd: root, stdio: "inherit" });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
  if (exitCode !== 0) throw new Error(`WebMCP evaluator exited with status ${exitCode}.`);

  const report = await latestReportAfter(startedAt);
  const summary = report.results ?? {};
  const { testCount, passCount, failCount, errorCount } = summary;
  if (![testCount, passCount, failCount, errorCount].every(Number.isInteger)) {
    throw new Error("WebMCP evaluator wrote a malformed result summary.");
  }
  if (failCount > 0 || errorCount > 0 || passCount === 0) {
    throw new Error(`WebMCP eval gate failed: ${passCount} passed, ${failCount} failed, ${errorCount} errored.`);
  }
  return summary;
}

async function runPaced() {
  const cases = JSON.parse(await readFile(`${root}${suite.evals}`, "utf8"));
  if (!Array.isArray(cases) || cases.length === 0) throw new Error("The evaluation suite must contain at least one case.");
  const requestedCase = process.env.WEBMCP_EVAL_CASE === undefined ? null : Number(process.env.WEBMCP_EVAL_CASE);
  if (requestedCase !== null && (!Number.isInteger(requestedCase) || requestedCase < 1 || requestedCase > cases.length)) {
    throw new Error(`WEBMCP_EVAL_CASE must be an integer from 1 through ${cases.length}.`);
  }
  const selectedCases = requestedCase === null
    ? cases.map((evaluation, index) => ({ evaluation, index }))
    : [{ evaluation: cases[requestedCase - 1], index: requestedCase - 1 }];
  const temporaryDirectory = await mkdtemp(`${reportDirectory}/paced-`);
  const aggregate = { testCount: 0, passCount: 0, failCount: 0, errorCount: 0 };
  try {
    for (const [position, { evaluation, index }] of selectedCases.entries()) {
      const temporaryPath = `${temporaryDirectory}/case-${index + 1}.json`;
      await writeFile(temporaryPath, `${JSON.stringify([evaluation], null, 2)}\n`);
      console.log(`\nCase ${index + 1}/${cases.length}: ${evaluation.name}`);
      const summary = await runEvaluator(temporaryPath);
      for (const key of Object.keys(aggregate)) aggregate[key] += summary[key];
      if (position < selectedCases.length - 1 && paceMs > 0) {
        console.log(`Pacing ${Math.round(paceMs / 1000)}s for the Gemini free-tier window…`);
        await new Promise((resolve) => setTimeout(resolve, paceMs));
      }
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  return aggregate;
}

try {
  const summary = paceMs > 0 ? await runPaced() : await runEvaluator(suite.evals);
  console.log(`\nWebMCP eval gate passed: ${summary.passCount} trajectory steps across ${summary.testCount} cases.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
