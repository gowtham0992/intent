import { appendActivity } from "./activity.js";
import { validateMandate } from "./mandate.js";
import { validateGoal } from "./policy.js";

export const RESUME_SCHEMA_VERSION = 1;
export const RESUME_TTL_MS = 24 * 60 * 60 * 1000;

const TOP_LEVEL_KEYS = new Set(["schemaVersion", "savedAt", "goal", "mandate", "mandateVersion", "activity"]);
const ACTIVITY_KEYS = new Set(["actor", "title", "detail", "tool"]);

function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function assertOnlyKeys(value, allowed, label) {
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new TypeError(`${label} contains unsupported fields.`);
}

function validateSavedAt(savedAt) {
  if (!Number.isSafeInteger(savedAt) || savedAt < 0) throw new TypeError("Safe resume timestamp is invalid.");
  return savedAt;
}

function validateMandateVersion(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) throw new TypeError("Safe resume mandate version is invalid.");
  return value;
}

function restoreActivity(input) {
  if (!Array.isArray(input) || input.length > 8) throw new TypeError("Safe resume activity is invalid.");
  let history = [];
  for (const rawEvent of input) {
    const event = plainObject(rawEvent, "Safe resume activity event");
    assertOnlyKeys(event, ACTIVITY_KEYS, "Safe resume activity event");
    history = appendActivity(history, event);
  }
  return history;
}

function durableActivity(input) {
  if (!Array.isArray(input) || input.length > 8) throw new TypeError("Safe resume activity is invalid.");
  return restoreActivity(input.map((event) => ({
    actor: event?.actor,
    title: event?.title,
    detail: event?.detail,
    ...(event?.tool ? { tool: event.tool } : {})
  }))).map(({ actor, title, detail, tool }) => Object.freeze({ actor, title, detail, ...(tool ? { tool } : {}) }));
}

function validatedSnapshot(input) {
  const value = plainObject(input, "Safe resume snapshot");
  assertOnlyKeys(value, TOP_LEVEL_KEYS, "Safe resume snapshot");
  if (value.schemaVersion !== RESUME_SCHEMA_VERSION) throw new TypeError("Safe resume schema version is unsupported.");
  const goal = validateGoal(value.goal);
  const mandate = validateMandate(value.mandate);
  if (mandate.maxAmountMinor !== Math.round(goal.budget * 100)) throw new TypeError("Safe resume budget and mandate do not match.");
  const mandateVersion = validateMandateVersion(value.mandateVersion);
  const savedAt = validateSavedAt(value.savedAt);
  const activity = restoreActivity(value.activity);
  return Object.freeze({ schemaVersion: RESUME_SCHEMA_VERSION, savedAt, goal, mandate, mandateVersion, activity });
}

export function createResumeSnapshot({ goal, mandate, mandateVersion, activity, savedAt = Date.now() }) {
  const cleanGoal = validateGoal(goal);
  const cleanMandate = validateMandate(mandate);
  if (cleanMandate.maxAmountMinor !== Math.round(cleanGoal.budget * 100)) throw new TypeError("Safe resume budget and mandate do not match.");
  const cleanActivity = Object.freeze(durableActivity(activity));
  return Object.freeze({
    schemaVersion: RESUME_SCHEMA_VERSION,
    savedAt: validateSavedAt(savedAt),
    goal: cleanGoal,
    mandate: cleanMandate,
    mandateVersion: validateMandateVersion(mandateVersion),
    activity: cleanActivity
  });
}

export function parseResumeSnapshot(serialized, { now = Date.now() } = {}) {
  if (typeof serialized !== "string" || serialized.length < 2 || serialized.length > 12_000) throw new TypeError("Safe resume JSON is invalid.");
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("Safe resume clock is invalid.");
  let input;
  try { input = JSON.parse(serialized); }
  catch { throw new TypeError("Safe resume JSON is invalid."); }
  const snapshot = validatedSnapshot(input);
  if (snapshot.savedAt > now + 60_000) throw new TypeError("Safe resume timestamp is in the future.");
  if (now - snapshot.savedAt > RESUME_TTL_MS) throw new TypeError("Safe resume snapshot expired.");
  return snapshot;
}
