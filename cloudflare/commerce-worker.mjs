const UCP_ENDPOINT = "https://catalog.shopify.com/api/ucp/mcp";
const UCP_VERSION = "2026-04-08";
const PRODUCT_ID = /^gid:\/\/shopify\/(?:p\/[A-Za-z0-9]+|Product\/\d+)$/;
const VARIANT_ID = /^gid:\/\/shopify\/ProductVariant\/\d+$/;
const CURRENCY = /^[A-Z]{3}$/;
const COUNTRY = /^[A-Z]{2}$/;
const LEASE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEASE_MS = 60_000;
const UCP_PROFILE = Object.freeze({ ucp: { version: UCP_VERSION, services: { "dev.ucp.shopping": [{ version: UCP_VERSION, spec: `https://ucp.dev/${UCP_VERSION}/specification/overview`, transport: "mcp", schema: `https://ucp.dev/${UCP_VERSION}/services/shopping/mcp.openrpc.json` }] }, capabilities: { "dev.ucp.shopping.catalog.search": [{ version: UCP_VERSION, spec: `https://ucp.dev/${UCP_VERSION}/specification/catalog/search`, schema: `https://ucp.dev/${UCP_VERSION}/schemas/shopping/catalog_search.json` }], "dev.ucp.shopping.catalog.lookup": [{ version: UCP_VERSION, spec: `https://ucp.dev/${UCP_VERSION}/specification/catalog/lookup`, schema: `https://ucp.dev/${UCP_VERSION}/schemas/shopping/catalog_lookup.json` }], "dev.shopify.catalog.global": [{ version: UCP_VERSION, spec: "https://shopify.dev/docs/agents/catalog/global-catalog", schema: `https://shopify.dev/ucp/schemas/${UCP_VERSION}/shopify_catalog_global.json`, extends: ["dev.ucp.shopping.catalog.search", "dev.ucp.shopping.catalog.lookup"] }] }, payment_handlers: {} } });

function exactOrigin(value, label = "origin") {
  const parsed = new URL(value);
  const local = parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname);
  if (!value || (parsed.protocol !== "https:" && !local) || parsed.origin !== value) throw new TypeError(`Invalid ${label}.`);
  return parsed.origin;
}

function merchantOrigins(env) {
  const configured = [env.MERCHANT_ORIGIN, env.ADDITIONAL_MERCHANT_ORIGIN].filter(Boolean);
  if (!configured.length) throw new TypeError("Missing app origin.");
  return new Set(configured.map((value, index) => exactOrigin(value, index ? "additional app origin" : "app origin")));
}

function publicHttps(value, label) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new TypeError(`Invalid ${label}.`);
  return parsed.href;
}

function cleanText(value, label, max) {
  if (typeof value !== "string") throw new TypeError(`${label} must be text.`);
  const clean = value.trim();
  if (!clean || clean.length > max || /[\u0000-\u001f\u007f]/.test(clean)) throw new TypeError(`Invalid ${label.toLowerCase()}.`);
  return clean;
}

function plain(value, max = 500) {
  return String(value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function numberInRange(value, label, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new TypeError(`Invalid ${label}.`);
  return value;
}

function onlyKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`Invalid ${label}.`);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new TypeError(`Unsupported ${label} field.`);
}

function validateSearch(value) {
  onlyKeys(value, new Set(["query", "budget", "country"]), "search");
  const budget = numberInRange(value.budget, "budget", 1, 10_000);
  const country = cleanText(value.country ?? "US", "Country", 2).toUpperCase();
  if (!COUNTRY.test(country)) throw new TypeError("Invalid country.");
  return {
    query: cleanText(value.query, "Query", 240), budget, country
  };
}

function validateScope(value, label, includeLease) {
  const fields = ["productId", "variantId", "amountMinor", "currency", "quantity", "country", "maxAmountMinor", "minimumRating", "minimumReviews"];
  if (includeLease) fields.push("leaseId");
  onlyKeys(value, new Set(fields), label);
  if (includeLease && !LEASE_ID.test(value.leaseId ?? "")) throw new TypeError("Invalid capability lease.");
  if (!PRODUCT_ID.test(value.productId ?? "")) throw new TypeError("Invalid product ID.");
  if (!VARIANT_ID.test(value.variantId ?? "")) throw new TypeError("Invalid variant ID.");
  if (!Number.isInteger(value.amountMinor) || value.amountMinor < 1 || value.amountMinor > 1_000_000) throw new TypeError("Invalid amount.");
  if (!CURRENCY.test(value.currency ?? "")) throw new TypeError("Invalid currency.");
  if (value.quantity !== 1) throw new TypeError("UCP checkout handoffs currently support exactly one item.");
  if (!Number.isInteger(value.maxAmountMinor) || value.maxAmountMinor < value.amountMinor || value.maxAmountMinor > 1_000_000) throw new TypeError("Invalid mandate budget.");
  if (typeof value.minimumRating !== "number" || !Number.isFinite(value.minimumRating) || value.minimumRating < 0 || value.minimumRating > 5) throw new TypeError("Invalid mandate rating.");
  if (!Number.isInteger(value.minimumReviews) || value.minimumReviews < 0 || value.minimumReviews > 1_000_000) throw new TypeError("Invalid mandate review count.");
  const country = cleanText(value.country ?? "US", "Country", 2).toUpperCase();
  if (!COUNTRY.test(country)) throw new TypeError("Invalid country.");
  return { ...value, country };
}

function validateLease(value) { return validateScope(value, "lease", false); }
function validateHandoff(value) { return validateScope(value, "handoff", true); }

function sameScope(left, right) {
  return ["productId", "variantId", "amountMinor", "currency", "quantity", "country", "maxAmountMinor", "minimumRating", "minimumReviews"].every((key) => left?.[key] === right?.[key]);
}

export class PurchaseLease {
  constructor(state) { this.state = state; }

  async fetch(request) {
    const url = new URL(request.url);
    const body = await request.json();
    if (url.pathname === "/issue") {
      await this.state.storage.put("lease", body);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/consume") {
      const result = await this.state.storage.transaction(async (transaction) => {
        const lease = await transaction.get("lease");
        if (!lease) return { ok: false, code: "LEASE_UNKNOWN", status: 404, message: "Capability lease does not exist." };
        if (lease.used) return { ok: false, code: "LEASE_REPLAYED", status: 409, message: "Capability lease was already consumed." };
        if (Date.now() > lease.expiresAt) return { ok: false, code: "LEASE_EXPIRED", status: 410, message: "Capability lease expired." };
        if (!sameScope(lease.scope, body.scope)) return { ok: false, code: "LEASE_SCOPE_MISMATCH", status: 403, message: "Capability scope does not match the human-approved mandate." };
        await transaction.put("lease", { ...lease, used: true, consumedAt: Date.now() });
        return { ok: true };
      });
      return Response.json(result, { status: result.status ?? 200 });
    }
    return Response.json({ ok: false }, { status: 404 });
  }
}

function leaseBinding(env) {
  if (!env.PURCHASE_LEASES?.idFromName || !env.PURCHASE_LEASES?.get) throw Object.assign(new Error("Capability service is not configured."), { code: "NOT_CONFIGURED", status: 503 });
  return env.PURCHASE_LEASES;
}

async function issueLease(env, scope) {
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + LEASE_MS;
  const binding = leaseBinding(env);
  const response = await binding.get(binding.idFromName(id)).fetch("https://lease.internal/issue", { method: "POST", body: JSON.stringify({ scope, expiresAt, used: false }) });
  if (!response.ok) throw Object.assign(new Error("Capability lease could not be created."), { code: "LEASE_UNAVAILABLE", status: 503 });
  return { id, expiresAt, uses: 1 };
}

async function consumeLease(env, input) {
  const binding = leaseBinding(env);
  const response = await binding.get(binding.idFromName(input.leaseId)).fetch("https://lease.internal/consume", { method: "POST", body: JSON.stringify({ scope: input }) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw Object.assign(new Error(result.message ?? "Capability lease was rejected."), { code: result.code ?? "LEASE_REJECTED", status: response.status });
}

function imageFor(product, variant) {
  const media = [...(variant?.media ?? []), ...(product?.media ?? [])].find((item) => item?.type === "image" && typeof item.url === "string");
  if (!media) return null;
  return { url: publicHttps(media.url, "image URL"), alt: plain(media.alt_text || product.title, 180) };
}

function normalizeVariant(product, variant) {
  if (!PRODUCT_ID.test(product?.id ?? "") || !VARIANT_ID.test(variant?.id ?? "")) throw new TypeError("UCP returned an invalid product identifier.");
  if (!Number.isInteger(variant.price?.amount) || variant.price.amount < 1 || !CURRENCY.test(variant.price?.currency ?? "")) throw new TypeError("UCP returned an invalid price.");
  if (!variant.seller?.name || !variant.seller?.url) throw new TypeError("UCP returned an invalid seller.");
  const sellerUrl = publicHttps(variant.seller.url, "seller URL");
  const checkoutUrl = publicHttps(variant.checkout_url, "checkout URL");
  const sellerHost = new URL(sellerUrl).hostname.replace(/^www\./, "");
  const checkoutHost = new URL(checkoutUrl).hostname.replace(/^www\./, "");
  if (sellerHost !== checkoutHost && checkoutHost !== "checkout.shopify.com") throw new TypeError("UCP checkout host does not match the seller.");
  const features = String(product.metadata?.top_features ?? "").split("\n").map((item) => plain(item, 160)).filter(Boolean).slice(0, 4);
  return Object.freeze({
    productId: product.id, variantId: variant.id, title: plain(product.title, 180), variantTitle: plain(variant.title, 120),
    description: plain(product.description?.plain, 420), image: imageFor(product, variant),
    price: { amountMinor: variant.price.amount, currency: variant.price.currency }, available: variant.availability?.available === true,
    seller: { id: plain(variant.seller.id, 120), name: plain(variant.seller.name, 100), url: sellerUrl, domain: plain(variant.seller.domain, 180) },
    checkoutUrl, rating: Number.isFinite(product.rating?.value) ? { value: product.rating.value, count: Number(product.rating.count ?? 0) } : null,
    evidence: { features, techSpecs: plain(product.metadata?.tech_specs, 800), source: "Shopify Global Catalog via UCP" }
  });
}

export function normalizeCatalog(content) {
  if (!content || content.ucp?.status !== "success" || content.ucp?.version !== UCP_VERSION) throw new TypeError("UCP returned an unsupported response.");
  const products = Array.isArray(content.products) ? content.products : content.product ? [content.product] : null;
  if (!products) throw new TypeError("UCP returned no product collection.");
  const offers = [];
  for (const product of products) {
    for (const variant of product?.variants ?? []) {
      try { if (variant.availability?.available === true) offers.push(normalizeVariant(product, variant)); } catch (error) { if (error instanceof TypeError || error instanceof URIError) continue; throw error; }
    }
  }
  return { offers, totalCount: Number(content.pagination?.total_count ?? offers.length), hasNextPage: Boolean(content.pagination?.has_next_page), messages: Array.isArray(content.messages) ? content.messages.slice(0, 8) : [] };
}

function agentProfile(env) {
  try { return publicHttps(env.UCP_AGENT_PROFILE_URL, "UCP agent profile"); }
  catch { throw Object.assign(new Error("UCP discovery is not configured."), { code: "NOT_CONFIGURED", status: 503 }); }
}

async function callUcp(env, toolName, catalog, fetchImpl) {
  const profile = agentProfile(env);
  const response = await fetchImpl(UCP_ENDPOINT, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name: toolName, arguments: { meta: { "ucp-agent": { profile } }, catalog } } }),
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw Object.assign(new Error("The universal catalog is temporarily unavailable."), { code: response.status === 429 ? "UPSTREAM_RATE_LIMITED" : "UPSTREAM_ERROR", status: 502 });
  let payload;
  try { payload = await response.json(); } catch { throw Object.assign(new Error("The universal catalog returned unreadable data."), { code: "UPSTREAM_INVALID", status: 502 }); }
  if (payload.error) throw Object.assign(new Error("The universal catalog rejected the request."), { code: "UPSTREAM_REJECTED", status: 502 });
  try { return normalizeCatalog(payload.result?.structuredContent); }
  catch { throw Object.assign(new Error("The universal catalog returned an invalid response."), { code: "UPSTREAM_INVALID", status: 502 }); }
}

function responseHeaders(origin) {
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "Content-Type": "application/json; charset=utf-8", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", Vary: "Origin" };
}
function json(origin, body, status = 200) { return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) }); }
async function readJson(request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > 4_096) throw Object.assign(new TypeError("Request is too large."), { status: 413 });
  const raw = await request.text(); if (raw.length > 4_096) throw Object.assign(new TypeError("Request is too large."), { status: 413 });
  try { return JSON.parse(raw); } catch { throw new TypeError("Request body must be JSON."); }
}

export async function handleRequest(request, env, fetchImpl = fetch) {
  const requestId = crypto.randomUUID(); let allowedOrigins;
  try { allowedOrigins = merchantOrigins(env); } catch { return json("null", { error: { code: "NOT_CONFIGURED", message: "Commerce gateway is not configured.", requestId } }, 503); }
  const requestUrl = new URL(request.url);
  if (request.method === "GET" && requestUrl.pathname === "/.well-known/ucp") {
    return new Response(JSON.stringify(UCP_PROFILE), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
  }
  const origin = request.headers.get("Origin");
  if (!allowedOrigins.has(origin)) return json("null", { error: { code: "ORIGIN_DENIED", message: "Origin is not allowed.", requestId } }, 403);
  const appOrigin = origin;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(appOrigin) });
  if (request.method !== "POST") return json(appOrigin, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed.", requestId } }, 405);
  try {
    const path = requestUrl.pathname; const body = await readJson(request);
    if (path === "/v1/search") {
      const input = validateSearch(body);
      const result = await callUcp(env, "search_catalog", { query: input.query, context: { address_country: input.country, currency: "USD", intent: input.query }, filters: { price: { max: Math.round(input.budget * 100) }, ships_to: { country: input.country }, available: true, condition: ["new"] }, pagination: { limit: 6 } }, fetchImpl);
      if (!result.offers.length) return json(appOrigin, { error: { code: "NO_MATCH", message: "No live, available offers matched this brief.", requestId } }, 404);
      return json(appOrigin, { ...result, source: { protocol: "UCP", version: UCP_VERSION, provider: "Shopify Global Catalog", live: true, cached: false } });
    }
    if (path === "/v1/leases") {
      const scope = validateLease(body);
      return json(appOrigin, { lease: await issueLease(env, scope) }, 201);
    }
    if (path === "/v1/checkout-handoff") {
      const input = validateHandoff(body);
      await consumeLease(env, input);
      const result = await callUcp(env, "lookup_catalog", { ids: [input.variantId], context: { address_country: input.country, currency: input.currency }, filters: { ships_to: { country: input.country }, available: true } }, fetchImpl);
      const offer = result.offers.find((candidate) => candidate.variantId === input.variantId);
      if (!offer || !offer.available) throw Object.assign(new Error("The approved offer is no longer available."), { code: "OFFER_UNAVAILABLE", status: 409 });
      if (offer.productId !== input.productId) throw Object.assign(new Error("The product identity changed. Review it again."), { code: "OFFER_CHANGED", status: 409 });
      if (offer.price.amountMinor !== input.amountMinor || offer.price.currency !== input.currency) throw Object.assign(new Error("The price changed. Review the offer again before checkout."), { code: "PRICE_CHANGED", status: 409 });
      const ratingRequired = input.minimumRating > 0 || input.minimumReviews > 0;
      if (offer.price.currency !== "USD" || offer.price.amountMinor > input.maxAmountMinor || (ratingRequired && (!offer.rating || offer.rating.value < input.minimumRating || offer.rating.count < input.minimumReviews))) {
        throw Object.assign(new Error("The live offer no longer satisfies the approved purchase mandate."), { code: "MANDATE_MISMATCH", status: 409 });
      }
      return json(appOrigin, { handoff: { checkoutUrl: offer.checkoutUrl, productId: offer.productId, variantId: offer.variantId, title: offer.title, seller: offer.seller, price: offer.price, quantity: 1, paymentSubmitted: false }, source: { protocol: "UCP", version: UCP_VERSION, live: true, revalidated: true } });
    }
    return json(appOrigin, { error: { code: "NOT_FOUND", message: "Not found.", requestId } }, 404);
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : error instanceof TypeError ? 400 : 502;
    const code = error.code ?? (error instanceof TypeError ? "INVALID_REQUEST" : "UPSTREAM_ERROR");
    console.error(JSON.stringify({ requestId, operation: new URL(request.url).pathname, code }));
    return json(appOrigin, { error: { code, message: error.message || "Commerce request failed.", requestId } }, status);
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env, fetch);
  }
};
