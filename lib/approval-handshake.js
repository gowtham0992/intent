export function createApprovalHandshake({ signal } = {}) {
  let settled = false;
  let resolvePromise;
  let abortHandler = null;

  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  function settle(result) {
    if (settled) return false;
    settled = true;
    if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
    resolvePromise(Object.freeze({ ...result }));
    return true;
  }

  abortHandler = () => settle({ outcome: "client_cancelled", detail: "The agent stopped waiting before the human decided." });
  if (signal?.aborted) abortHandler();
  else signal?.addEventListener("abort", abortHandler, { once: true });

  return Object.freeze({
    promise,
    settle,
    get settled() { return settled; }
  });
}
