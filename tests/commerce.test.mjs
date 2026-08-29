import test from "node:test";
import assert from "node:assert/strict";
import worker, { handleRequest, normalizeCatalog, PurchaseLease } from "../cloudflare/commerce-worker.mjs";

const origin = "https://intent.example";
const profile = "https://intent.example/.well-known/ucp";
function memoryLeaseBinding() {
  const objects = new Map();
  return {
    idFromName(name) { return name; },
    get(id) {
      if (!objects.has(id)) {
        const values = new Map();
        const storage = { get: (key) => values.get(key), put: (key, value) => { values.set(key, value); }, transaction: (callback) => callback(storage) };
        objects.set(id, new PurchaseLease({ storage }));
      }
      return { fetch: (url, options) => objects.get(id).fetch(new Request(url, options)) };
    }
  };
}
const env = { MERCHANT_ORIGIN: origin, UCP_AGENT_PROFILE_URL: profile, PURCHASE_LEASES: memoryLeaseBinding() };
const goal = { query: "65W USB-C charger compatible with a MacBook, 20V/3.25A", budget: 60, country: "US" };
const handoff = { productId: "gid://shopify/p/abc", variantId: "gid://shopify/ProductVariant/47179832295660", amountMinor: 2999, currency: "USD", quantity: 1, country: "US", maxAmountMinor: 6000, minimumRating: 4.5, minimumReviews: 100 };
const product = {
  id: "gid://shopify/p/abc", title: "Anker 715 Charger (Nano II 65W)", description: { plain: "Compact 65W GaN charger for USB-C notebooks." },
  rating: { value: 4.8, count: 459 }, metadata: { top_features: "65W GaN charging\nCompact design", tech_specs: "Output Power: 65W\nConnector Type: USB Type-C" },
  media: [{ type: "image", url: "https://cdn.shopify.com/charger.png", alt_text: "Black charger" }],
  variants: [{ id: "gid://shopify/ProductVariant/47179832295660", title: "Black", price: { amount: 2999, currency: "USD" }, availability: { available: true }, checkout_url: "https://apos.audio/cart/47179832295660:1?utm_source=shopify", seller: { id: "gid://shopify/Shop/1", name: "Apos", url: "https://apos.audio", domain: "apos-audio.myshopify.com" }, media: [{ type: "image", url: "https://cdn.shopify.com/charger-black.png", alt_text: "Black charger" }] }]
};

function ucp(products = [product]) { return { jsonrpc: "2.0", id: 1, result: { structuredContent: { ucp: { version: "2026-04-08", status: "success" }, products, pagination: { total_count: products.length, has_next_page: false } } } }; }
function request(path, body, requestOrigin = origin) { return new Request(`https://commerce.example${path}`, { method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
async function leased(input) {
  const response = await handleRequest(request("/v1/leases", input), env, () => { throw new Error("must not call UCP"); });
  assert.equal(response.status, 201);
  const payload = await response.json();
  return { ...input, leaseId: payload.lease.id };
}

test("catalog normalization yields safe, live, minor-unit offers", () => {
  const offers = normalizeCatalog(ucp().result.structuredContent).offers;
  assert.equal(offers[0].variantId, product.variants[0].id);
  assert.equal(offers[0].price.amountMinor, 2999);
  assert.equal(offers[0].seller.name, "Apos");
  assert.equal(offers[0].checkoutUrl, product.variants[0].checkout_url);
});

test("search calls the public UCP catalog with a public Intent profile", async () => {
  const mockFetch = async (url, options) => {
    assert.equal(url, "https://catalog.shopify.com/api/ucp/mcp");
    const rpc = JSON.parse(options.body);
    assert.equal(rpc.method, "tools/call");
    assert.equal(rpc.params.name, "search_catalog");
    assert.equal(rpc.params.arguments.meta["ucp-agent"].profile, profile);
    assert.equal(rpc.params.arguments.catalog.filters.price.max, 6000);
    assert.deepEqual(rpc.params.arguments.catalog.filters.ships_to, { country: "US" });
    assert.equal(rpc.params.arguments.catalog.context.address_country, "US");
    return Response.json(ucp());
  };
  const response = await handleRequest(request("/v1/search", goal), env, mockFetch);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.offers.length, 1);
  assert.equal(payload.source.protocol, "UCP");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("offer handoff revalidates product, variant, price, destination, availability, and URL", async () => {
  const mockFetch = async (_url, options) => { const rpc = JSON.parse(options.body); assert.equal(rpc.params.name, "lookup_catalog"); assert.deepEqual(rpc.params.arguments.catalog.ids, [product.variants[0].id]); assert.deepEqual(rpc.params.arguments.catalog.filters.ships_to, { country: "US" }); return Response.json(ucp()); };
  const input = await leased({ ...handoff, productId: product.id });
  const response = await handleRequest(request("/v1/checkout-handoff", input), env, mockFetch);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.handoff.checkoutUrl, product.variants[0].checkout_url);
  assert.equal(payload.handoff.paymentSubmitted, false);
});

test("handoff fails closed on price drift, unavailable products, and unsafe URLs", async () => {
  const changed = await handleRequest(request("/v1/checkout-handoff", await leased({ ...handoff, productId: product.id })), env, async () => Response.json(ucp([{ ...product, variants: [{ ...product.variants[0], price: { amount: 3199, currency: "USD" } }] }])));
  assert.equal(changed.status, 409); assert.equal((await changed.json()).error.code, "PRICE_CHANGED");
  const gone = await handleRequest(request("/v1/checkout-handoff", await leased({ ...handoff, productId: product.id })), env, async () => Response.json(ucp([{ ...product, variants: [{ ...product.variants[0], availability: { available: false } }] }])));
  assert.equal(gone.status, 409);
  const unsafe = await handleRequest(request("/v1/checkout-handoff", await leased({ ...handoff, productId: product.id })), env, async () => Response.json(ucp([{ ...product, variants: [{ ...product.variants[0], checkout_url: "javascript:alert(1)" }] }])));
  assert.equal(unsafe.status, 502);
});

test("search rejects excess fields, denied origins, and malformed UCP", async () => {
  const denied = await handleRequest(request("/v1/search", goal, "https://attacker.example"), env, () => { throw new Error("must not call"); }); assert.equal(denied.status, 403);
  const excess = await handleRequest(request("/v1/search", { ...goal, email: "no@example.com" }), env, () => { throw new Error("must not call"); }); assert.equal(excess.status, 400);
  const malformed = await handleRequest(request("/v1/search", goal), env, async () => Response.json({ jsonrpc: "2.0", id: 1, result: {} })); assert.equal(malformed.status, 502);
});

test("commerce accepts each explicitly configured application origin", async () => {
  const sitesOrigin = "https://intent-commerce.example";
  const multiOriginEnv = { ...env, ADDITIONAL_MERCHANT_ORIGIN: sitesOrigin };
  const sitesRequest = request("/v1/search", goal, sitesOrigin);
  const response = await handleRequest(sitesRequest, multiOriginEnv, async () => Response.json(ucp()));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), sitesOrigin);
});

test("handoff rechecks the approved reputation mandate", async () => {
  const input = await leased({ ...handoff, productId: product.id, minimumRating: 4.9 });
  const response = await handleRequest(request("/v1/checkout-handoff", input), env, async () => Response.json(ucp()));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "MANDATE_MISMATCH");
});

test("the gateway needs no store credentials but does require an exact public profile", async () => {
  const response = await handleRequest(request("/v1/search", goal), { MERCHANT_ORIGIN: origin, PURCHASE_LEASES: memoryLeaseBinding() }, () => { throw new Error("must not call"); }); assert.equal(response.status, 503);
});

test("a server-issued capability is atomically single-use and rejects replay", async () => {
  const input = await leased({ ...handoff, productId: product.id });
  let lookups = 0;
  const mockFetch = async () => { lookups += 1; return Response.json(ucp()); };
  const first = await handleRequest(request("/v1/checkout-handoff", input), env, mockFetch);
  assert.equal(first.status, 200);
  const replay = await handleRequest(request("/v1/checkout-handoff", input), env, mockFetch);
  assert.equal(replay.status, 409);
  assert.equal((await replay.json()).error.code, "LEASE_REPLAYED");
  assert.equal(lookups, 1);
});

test("a capability cannot be widened after the human grants it", async () => {
  const input = await leased({ ...handoff, productId: product.id });
  const widened = await handleRequest(request("/v1/checkout-handoff", { ...input, amountMinor: 3000 }), env, () => { throw new Error("must reject before UCP"); });
  assert.equal(widened.status, 403);
  assert.equal((await widened.json()).error.code, "LEASE_SCOPE_MISMATCH");
});

test("Cloudflare adapter never treats execution context as fetch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(ucp());
  try {
    const response = await worker.fetch(request("/v1/search", goal), env, { waitUntil() {} });
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("UCP discovery profile is public and cacheable while commerce remains no-store", async () => {
  const response = await handleRequest(new Request("https://commerce.example/.well-known/ucp"), env, () => { throw new Error("must not call"); });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.match(response.headers.get("Cache-Control"), /public/);
  assert.equal((await response.json()).ucp.version, "2026-04-08");
});
