import type { Metadata } from "next";
import "./sites.css";

export const metadata: Metadata = {
  title: "Intent — Human-approved authority for agentic shopping",
  description: "A shared WebMCP decision room that turns human shopping rules into narrow, expiring, server-enforced agent authority."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
