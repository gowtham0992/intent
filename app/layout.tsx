import type { Metadata } from "next";
import "./sites.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://intent-commerce.gowtham0992.chatgpt.site"),
  title: "Intent — Human-approved authority for agentic shopping",
  description: "Your agent shops. You call the shots. Intent turns approval into narrow, expiring, server-enforced authority.",
  icons: {
    icon: "/assets/intent-mark-v2.png",
    apple: "/assets/intent-mark-v2.png"
  },
  openGraph: {
    title: "Intent — Your agent shops. You call the shots.",
    description: "One human-approved checkout capability. Exact scope. One use.",
    images: [{ url: "/assets/intent-social-preview.png", width: 1200, height: 628, alt: "Intent — Your agent shops. You call the shots." }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Intent — Your agent shops. You call the shots.",
    description: "One human-approved checkout capability. Exact scope. One use.",
    images: ["/assets/intent-social-preview.png"]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
