import type { Metadata } from "next";
import "./sites.css";

export const metadata: Metadata = {
  title: "Intent — Human-approved authority for agentic shopping",
  description: "Intent turns human approval into narrow, expiring, server-enforced authority for agentic shopping."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
