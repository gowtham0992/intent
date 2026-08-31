import profile from "../../../.well-known/ucp?raw";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(profile, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
