import { normalizeCommerceErrorCode } from "./capability-state.js";

function safeMessage(value) {
  if (typeof value !== "string") return "The commerce rail failed.";
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, 240) : "The commerce rail failed.";
}

export function commerceErrorFromResponse(payload, status) {
  const error = new Error(safeMessage(payload?.error?.message));
  error.code = normalizeCommerceErrorCode(payload?.error?.code);
  error.status = Number.isInteger(status) ? status : 500;
  return error;
}

