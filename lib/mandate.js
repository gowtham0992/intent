function finite(value) { return typeof value === "number" && Number.isFinite(value); }

export function validateMandate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Mandate must be an object.");
  const allowed = new Set(["maxAmountMinor", "currency", "minimumRating", "minimumReviews"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new TypeError("Mandate contains an unsupported field.");
  if (!Number.isInteger(input.maxAmountMinor) || input.maxAmountMinor < 100 || input.maxAmountMinor > 1_000_000) throw new TypeError("Invalid mandate budget.");
  if (input.currency !== "USD") throw new TypeError("This mandate currently requires USD evidence.");
  if (!finite(input.minimumRating) || input.minimumRating < 0 || input.minimumRating > 5) throw new TypeError("Minimum rating must be between 0 and 5.");
  if (!Number.isInteger(input.minimumReviews) || input.minimumReviews < 0 || input.minimumReviews > 1_000_000) throw new TypeError("Invalid minimum review count.");
  return Object.freeze({ maxAmountMinor: input.maxAmountMinor, currency: input.currency, minimumRating: Math.round(input.minimumRating * 10) / 10, minimumReviews: input.minimumReviews });
}

export function createMandate(goal, preferences = {}) {
  return validateMandate({
    maxAmountMinor: Math.round(goal.budget * 100), currency: "USD",
    minimumRating: preferences.minimumRating ?? 0,
    minimumReviews: preferences.minimumReviews ?? 0
  });
}

export function evaluateOffer(offer, mandateInput) {
  const mandate = validateMandate(mandateInput);
  const checks = [];
  const check = (code, passed, pass, fail) => checks.push(Object.freeze({ code, passed, message: passed ? pass : fail }));
  check("availability", offer?.available === true, "Available now", "Not currently available");
  const currencyMatches = offer?.price?.currency === mandate.currency;
  const amountPresent = Number.isInteger(offer?.price?.amountMinor);
  check("currency", currencyMatches, `${mandate.currency} price verified`, `Price is not in ${mandate.currency}; budget cannot be verified`);
  const withinBudget = currencyMatches && amountPresent && offer.price.amountMinor <= mandate.maxAmountMinor;
  const budgetFailure = currencyMatches && amountPresent ? `Over hard budget by $${((offer.price.amountMinor-mandate.maxAmountMinor)/100).toFixed(2)}` : "Hard budget cannot be verified";
  check("budget", withinBudget, `Within hard budget by $${((mandate.maxAmountMinor-offer.price.amountMinor)/100).toFixed(2)}`, budgetFailure);
  const ratingPresent = Number.isFinite(offer?.rating?.value) && Number.isInteger(offer?.rating?.count);
  const ratingPassed = mandate.minimumRating === 0 || (ratingPresent && offer.rating.value >= mandate.minimumRating);
  const ratingGap = ratingPresent ? (Math.round((mandate.minimumRating-offer.rating.value)*10)/10).toFixed(1) : null;
  const ratingPassMessage = mandate.minimumRating && ratingPresent ? `Rating ${offer.rating.value.toFixed(1)} meets ${mandate.minimumRating.toFixed(1)} minimum` : "No rating threshold required";
  check("rating", ratingPassed, ratingPassMessage, ratingPresent ? `Rating is ${ratingGap} below minimum ${mandate.minimumRating.toFixed(1)}` : "Required rating evidence is missing");
  const reviewsPassed = mandate.minimumReviews === 0 || (ratingPresent && offer.rating.count >= mandate.minimumReviews);
  const reviewsPassMessage = mandate.minimumReviews && ratingPresent ? `${offer.rating.count.toLocaleString()} reviews meet ${mandate.minimumReviews.toLocaleString()} minimum` : "No review-count threshold required";
  check("reviews", reviewsPassed, reviewsPassMessage, ratingPresent ? `Review count is ${(mandate.minimumReviews-offer.rating.count).toLocaleString()} below minimum ${mandate.minimumReviews.toLocaleString()}` : "Required review-count evidence is missing");
  return Object.freeze({ eligible: checks.every((item) => item.passed), checks: Object.freeze(checks), reasons: Object.freeze(checks.filter((item) => !item.passed).map((item) => item.message)) });
}
