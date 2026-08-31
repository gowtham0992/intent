import html from "../../index.html?raw";

const commerceOrigin = "https://intent-commerce.gowtham0992.workers.dev";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(html, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; frame-src 'none'; connect-src 'self' ${commerceOrigin}; object-src 'none'; base-uri 'none'; frame-ancestors 'self'`,
      "Content-Type": "text/html; charset=utf-8",
      "Permissions-Policy": "tools=(self)",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
