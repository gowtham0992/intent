const AUTHORITY_STATES = new Set(["absent", "live", "used", "expired"]);
const REASON = /^[a-z][a-z0-9_]{2,63}$/;

export function createToolReadback({ mandateVersion, authority }) {
  if (!Number.isSafeInteger(mandateVersion) || mandateVersion < 1) throw new TypeError("Tool read-back mandate version must be a positive integer.");
  if (!AUTHORITY_STATES.has(authority?.state)) throw new TypeError("Tool read-back authority state is invalid.");
  if (typeof authority.reason !== "string" || !REASON.test(authority.reason)) throw new TypeError("Tool read-back authority reason is invalid.");
  return Object.freeze({
    mandateVersion,
    authorityState: authority.state,
    reason: authority.reason
  });
}
