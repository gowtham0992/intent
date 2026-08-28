import { createCheckoutToolContract, staticToolContracts } from "../lib/webmcp-tool-contracts.js";

export const grantedScope = Object.freeze({
  leaseId: "eval_lease_single_use_01",
  productId: "gid://shopify/Product/intent-eval-100w",
  variantId: "gid://shopify/ProductVariant/intent-eval-100w-black",
  amountMinor: 6999,
  currency: "USD",
  country: "US",
  maxAmountMinor: 10000,
  minimumRating: 4.5,
  minimumReviews: 200
});

export function createEvalToolDocuments() {
  const withoutAnnotations = ({ annotations: _annotations, ...tool }) => tool;
  const staticTools = Object.values(staticToolContracts).map(withoutAnnotations);
  const checkout = createCheckoutToolContract({
    mandateVersion: 2,
    title: "Anker Prime Charger (100W, 3 Ports, GaN)",
    seller: "Anker",
    displayPrice: "$69.99",
    scope: grantedScope
  });

  return {
    preApproval: { tools: staticTools },
    granted: {
      tools: [
        withoutAnnotations(staticToolContracts.read),
        withoutAnnotations(checkout)
      ]
    }
  };
}
